import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from "viem"
import { describe, expect, it } from "vitest"
import { BRIDGE_TOKEN_FACTORY_ABI } from "./abi.js"
import { getInitTransferTopic, type LogEntry, parseInitTransferEvent } from "./events.js"

describe("parseInitTransferEvent", () => {
  // Build a realistic mock log matching the InitTransfer event signature
  const mockSender = "0x1234567890123456789012345678901234567890"
  const mockTokenAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
  const mockOriginNonce = 42n
  const mockAmount = 1000000000000000000n // 1 token (18 decimals)
  const mockFee = 10000000000000000n // 0.01 fee
  const mockNativeTokenFee = 5000000000000000n // 0.005 native fee
  const mockRecipient = "near:alice.near"
  const mockMessage = ""

  function createMockInitTransferLog(): LogEntry {
    const topics = encodeEventTopics({
      abi: BRIDGE_TOKEN_FACTORY_ABI,
      eventName: "InitTransfer",
      args: {
        sender: mockSender,
        tokenAddress: mockTokenAddress,
        originNonce: mockOriginNonce,
      },
    }) as string[]

    const data = encodeAbiParameters(
      parseAbiParameters("uint128, uint128, uint128, string, string"),
      [mockAmount, mockFee, mockNativeTokenFee, mockRecipient, mockMessage],
    )

    return {
      topics,
      data,
    }
  }

  it("should parse a valid InitTransfer event", () => {
    const log = createMockInitTransferLog()
    const result = parseInitTransferEvent([log])

    expect(result.sender.toLowerCase()).toBe(mockSender.toLowerCase())
    expect(result.tokenAddress.toLowerCase()).toBe(mockTokenAddress.toLowerCase())
    expect(result.originNonce).toBe(mockOriginNonce)
    expect(result.amount).toBe(mockAmount)
    expect(result.fee).toBe(mockFee)
    expect(result.nativeTokenFee).toBe(mockNativeTokenFee)
    expect(result.recipient).toBe(mockRecipient)
    expect(result.message).toBe(mockMessage)
  })

  it("should find InitTransfer among multiple logs", () => {
    const unrelatedLog: LogEntry = {
      topics: ["0x0000000000000000000000000000000000000000000000000000000000000000"],
      data: "0x",
    }
    const initTransferLog = createMockInitTransferLog()

    const result = parseInitTransferEvent([unrelatedLog, initTransferLog])

    expect(result.sender.toLowerCase()).toBe(mockSender.toLowerCase())
    expect(result.originNonce).toBe(mockOriginNonce)
  })

  it("should throw if no InitTransfer event is found", () => {
    const unrelatedLog: LogEntry = {
      topics: ["0x0000000000000000000000000000000000000000000000000000000000000000"],
      data: "0x",
    }

    expect(() => parseInitTransferEvent([unrelatedLog])).toThrow(
      "InitTransfer event not found in transaction logs",
    )
  })

  it("should throw for empty logs array", () => {
    expect(() => parseInitTransferEvent([])).toThrow(
      "InitTransfer event not found in transaction logs",
    )
  })

  it("should handle logs with string topics (ethers format)", () => {
    const log = createMockInitTransferLog()
    // Ethers returns string[] instead of readonly string[]
    const ethersLog: LogEntry = {
      topics: [...log.topics] as string[],
      data: log.data,
    }

    const result = parseInitTransferEvent([ethersLog])
    expect(result.sender.toLowerCase()).toBe(mockSender.toLowerCase())
  })
})

describe("getInitTransferTopic", () => {
  it("should return the correct topic hash", () => {
    const topic = getInitTransferTopic()

    // Compute expected topic from ABI
    const [expectedTopic] = encodeEventTopics({
      abi: BRIDGE_TOKEN_FACTORY_ABI,
      eventName: "InitTransfer",
    })

    expect(topic).toBe(expectedTopic)
  })
})
