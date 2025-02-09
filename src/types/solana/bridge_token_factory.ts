/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/bridge_token_factory.json`.
 */
export type BridgeTokenFactory = {
  address: "Gy1XPwYZURfBzHiGAxnw3SYC33SfqsEpGSS5zeBge28p"
  metadata: {
    name: "bridgeTokenFactory"
    version: "0.1.0"
    spec: "0.1.0"
    description: "Created with Anchor"
  }
  instructions: [
    {
      name: "deployToken"
      discriminator: [144, 104, 20, 192, 18, 112, 224, 140]
      accounts: [
        {
          name: "authority"
          pda: {
            seeds: [
              {
                kind: "const"
                value: [97, 117, 116, 104, 111, 114, 105, 116, 121]
              },
            ]
          }
        },
        {
          name: "mint"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [119, 114, 97, 112, 112, 101, 100, 95, 109, 105, 110, 116]
              },
              {
                kind: "arg"
                path: "data.payload.token"
              },
            ]
          }
        },
        {
          name: "metadata"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [109, 101, 116, 97, 100, 97, 116, 97]
              },
              {
                kind: "const"
                value: [
                  11,
                  112,
                  101,
                  177,
                  227,
                  209,
                  124,
                  69,
                  56,
                  157,
                  82,
                  127,
                  107,
                  4,
                  195,
                  205,
                  88,
                  184,
                  108,
                  115,
                  26,
                  160,
                  253,
                  181,
                  73,
                  182,
                  209,
                  188,
                  3,
                  248,
                  41,
                  70,
                ]
              },
              {
                kind: "account"
                path: "mint"
              },
            ]
            program: {
              kind: "const"
              value: [
                11,
                112,
                101,
                177,
                227,
                209,
                124,
                69,
                56,
                157,
                82,
                127,
                107,
                4,
                195,
                205,
                88,
                184,
                108,
                115,
                26,
                160,
                253,
                181,
                73,
                182,
                209,
                188,
                3,
                248,
                41,
                70,
              ]
            }
          }
        },
        {
          name: "common"
          accounts: [
            {
              name: "config"
              docs: ["Used as an emitter"]
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [99, 111, 110, 102, 105, 103]
                  },
                ]
              }
            },
            {
              name: "bridge"
              docs: [
                "Wormhole bridge data account (a.k.a. its config).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [66, 114, 105, 100, 103, 101]
                  },
                ]
              }
            },
            {
              name: "feeCollector"
              docs: [
                "Wormhole fee collector account, which requires lamports before the",
                "program can post a message (if there is a fee).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [102, 101, 101, 95, 99, 111, 108, 108, 101, 99, 116, 111, 114]
                  },
                ]
              }
            },
            {
              name: "sequence"
              docs: [
                "message is posted, so it needs to be an [`UncheckedAccount`] for the",
                "[`initialize`](crate::initialize) instruction.",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [83, 101, 113, 117, 101, 110, 99, 101]
                  },
                  {
                    kind: "account"
                    path: "config"
                  },
                ]
              }
            },
            {
              name: "message"
              docs: ["account be mutable."]
              writable: true
              signer: true
            },
            {
              name: "payer"
              writable: true
              signer: true
            },
            {
              name: "clock"
              address: "SysvarC1ock11111111111111111111111111111111"
            },
            {
              name: "rent"
              address: "SysvarRent111111111111111111111111111111111"
            },
            {
              name: "wormholeProgram"
              docs: ["Wormhole program."]
              address: "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
            },
            {
              name: "systemProgram"
              address: "11111111111111111111111111111111"
            },
          ]
        },
        {
          name: "systemProgram"
          address: "11111111111111111111111111111111"
        },
        {
          name: "tokenProgram"
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          name: "tokenMetadataProgram"
          address: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
      ]
      args: [
        {
          name: "data"
          type: {
            defined: {
              name: "signedPayload"
              generics: [
                {
                  kind: "type"
                  type: {
                    defined: {
                      name: "deployTokenPayload"
                    }
                  }
                },
              ]
            }
          }
        },
      ]
    },
    {
      name: "finalizeTransfer"
      discriminator: [124, 126, 103, 188, 144, 65, 135, 51]
      accounts: [
        {
          name: "usedNonces"
          writable: true
        },
        {
          name: "authority"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [97, 117, 116, 104, 111, 114, 105, 116, 121]
              },
            ]
          }
        },
        {
          name: "recipient"
        },
        {
          name: "mint"
        },
        {
          name: "vault"
          writable: true
          optional: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [118, 97, 117, 108, 116]
              },
              {
                kind: "account"
                path: "mint"
              },
            ]
          }
        },
        {
          name: "tokenAccount"
          writable: true
          pda: {
            seeds: [
              {
                kind: "account"
                path: "recipient"
              },
              {
                kind: "const"
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169,
                ]
              },
              {
                kind: "account"
                path: "mint"
              },
            ]
            program: {
              kind: "const"
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ]
            }
          }
        },
        {
          name: "common"
          accounts: [
            {
              name: "config"
              docs: ["Used as an emitter"]
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [99, 111, 110, 102, 105, 103]
                  },
                ]
              }
            },
            {
              name: "bridge"
              docs: [
                "Wormhole bridge data account (a.k.a. its config).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [66, 114, 105, 100, 103, 101]
                  },
                ]
              }
            },
            {
              name: "feeCollector"
              docs: [
                "Wormhole fee collector account, which requires lamports before the",
                "program can post a message (if there is a fee).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [102, 101, 101, 95, 99, 111, 108, 108, 101, 99, 116, 111, 114]
                  },
                ]
              }
            },
            {
              name: "sequence"
              docs: [
                "message is posted, so it needs to be an [`UncheckedAccount`] for the",
                "[`initialize`](crate::initialize) instruction.",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [83, 101, 113, 117, 101, 110, 99, 101]
                  },
                  {
                    kind: "account"
                    path: "config"
                  },
                ]
              }
            },
            {
              name: "message"
              docs: ["account be mutable."]
              writable: true
              signer: true
            },
            {
              name: "payer"
              writable: true
              signer: true
            },
            {
              name: "clock"
              address: "SysvarC1ock11111111111111111111111111111111"
            },
            {
              name: "rent"
              address: "SysvarRent111111111111111111111111111111111"
            },
            {
              name: "wormholeProgram"
              docs: ["Wormhole program."]
              address: "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
            },
            {
              name: "systemProgram"
              address: "11111111111111111111111111111111"
            },
          ]
        },
        {
          name: "associatedTokenProgram"
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          name: "systemProgram"
          address: "11111111111111111111111111111111"
        },
        {
          name: "tokenProgram"
        },
      ]
      args: [
        {
          name: "data"
          type: {
            defined: {
              name: "signedPayload"
              generics: [
                {
                  kind: "type"
                  type: {
                    defined: {
                      name: "finalizeTransferPayload"
                    }
                  }
                },
              ]
            }
          }
        },
      ]
    },
    {
      name: "finalizeTransferSol"
      discriminator: [104, 27, 121, 69, 3, 70, 217, 66]
      accounts: [
        {
          name: "config"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [99, 111, 110, 102, 105, 103]
              },
            ]
          }
        },
        {
          name: "usedNonces"
          writable: true
        },
        {
          name: "authority"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [97, 117, 116, 104, 111, 114, 105, 116, 121]
              },
            ]
          }
        },
        {
          name: "recipient"
          writable: true
        },
        {
          name: "solVault"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [115, 111, 108, 95, 118, 97, 117, 108, 116]
              },
            ]
          }
        },
        {
          name: "common"
          accounts: [
            {
              name: "config"
              docs: ["Used as an emitter"]
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [99, 111, 110, 102, 105, 103]
                  },
                ]
              }
            },
            {
              name: "bridge"
              docs: [
                "Wormhole bridge data account (a.k.a. its config).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [66, 114, 105, 100, 103, 101]
                  },
                ]
              }
            },
            {
              name: "feeCollector"
              docs: [
                "Wormhole fee collector account, which requires lamports before the",
                "program can post a message (if there is a fee).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [102, 101, 101, 95, 99, 111, 108, 108, 101, 99, 116, 111, 114]
                  },
                ]
              }
            },
            {
              name: "sequence"
              docs: [
                "message is posted, so it needs to be an [`UncheckedAccount`] for the",
                "[`initialize`](crate::initialize) instruction.",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [83, 101, 113, 117, 101, 110, 99, 101]
                  },
                  {
                    kind: "account"
                    path: "config"
                  },
                ]
              }
            },
            {
              name: "message"
              docs: ["account be mutable."]
              writable: true
              signer: true
            },
            {
              name: "payer"
              writable: true
              signer: true
            },
            {
              name: "clock"
              address: "SysvarC1ock11111111111111111111111111111111"
            },
            {
              name: "rent"
              address: "SysvarRent111111111111111111111111111111111"
            },
            {
              name: "wormholeProgram"
              docs: ["Wormhole program."]
              address: "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
            },
            {
              name: "systemProgram"
              address: "11111111111111111111111111111111"
            },
          ]
        },
        {
          name: "systemProgram"
          address: "11111111111111111111111111111111"
        },
      ]
      args: [
        {
          name: "data"
          type: {
            defined: {
              name: "signedPayload"
              generics: [
                {
                  kind: "type"
                  type: {
                    defined: {
                      name: "finalizeTransferPayload"
                    }
                  }
                },
              ]
            }
          }
        },
      ]
    },
    {
      name: "initTransfer"
      discriminator: [174, 50, 134, 99, 122, 243, 243, 224]
      accounts: [
        {
          name: "authority"
          pda: {
            seeds: [
              {
                kind: "const"
                value: [97, 117, 116, 104, 111, 114, 105, 116, 121]
              },
            ]
          }
        },
        {
          name: "mint"
          writable: true
        },
        {
          name: "from"
          writable: true
        },
        {
          name: "vault"
          writable: true
          optional: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [118, 97, 117, 108, 116]
              },
              {
                kind: "account"
                path: "mint"
              },
            ]
          }
        },
        {
          name: "solVault"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [115, 111, 108, 95, 118, 97, 117, 108, 116]
              },
            ]
          }
        },
        {
          name: "user"
          writable: true
          signer: true
        },
        {
          name: "common"
          accounts: [
            {
              name: "config"
              docs: ["Used as an emitter"]
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [99, 111, 110, 102, 105, 103]
                  },
                ]
              }
            },
            {
              name: "bridge"
              docs: [
                "Wormhole bridge data account (a.k.a. its config).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [66, 114, 105, 100, 103, 101]
                  },
                ]
              }
            },
            {
              name: "feeCollector"
              docs: [
                "Wormhole fee collector account, which requires lamports before the",
                "program can post a message (if there is a fee).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [102, 101, 101, 95, 99, 111, 108, 108, 101, 99, 116, 111, 114]
                  },
                ]
              }
            },
            {
              name: "sequence"
              docs: [
                "message is posted, so it needs to be an [`UncheckedAccount`] for the",
                "[`initialize`](crate::initialize) instruction.",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [83, 101, 113, 117, 101, 110, 99, 101]
                  },
                  {
                    kind: "account"
                    path: "config"
                  },
                ]
              }
            },
            {
              name: "message"
              docs: ["account be mutable."]
              writable: true
              signer: true
            },
            {
              name: "payer"
              writable: true
              signer: true
            },
            {
              name: "clock"
              address: "SysvarC1ock11111111111111111111111111111111"
            },
            {
              name: "rent"
              address: "SysvarRent111111111111111111111111111111111"
            },
            {
              name: "wormholeProgram"
              docs: ["Wormhole program."]
              address: "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
            },
            {
              name: "systemProgram"
              address: "11111111111111111111111111111111"
            },
          ]
        },
        {
          name: "tokenProgram"
        },
      ]
      args: [
        {
          name: "payload"
          type: {
            defined: {
              name: "initTransferPayload"
            }
          }
        },
      ]
    },
    {
      name: "initTransferSol"
      discriminator: [124, 167, 164, 191, 81, 140, 108, 30]
      accounts: [
        {
          name: "solVault"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [115, 111, 108, 95, 118, 97, 117, 108, 116]
              },
            ]
          }
        },
        {
          name: "user"
          writable: true
          signer: true
        },
        {
          name: "common"
          accounts: [
            {
              name: "config"
              docs: ["Used as an emitter"]
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [99, 111, 110, 102, 105, 103]
                  },
                ]
              }
            },
            {
              name: "bridge"
              docs: [
                "Wormhole bridge data account (a.k.a. its config).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [66, 114, 105, 100, 103, 101]
                  },
                ]
              }
            },
            {
              name: "feeCollector"
              docs: [
                "Wormhole fee collector account, which requires lamports before the",
                "program can post a message (if there is a fee).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [102, 101, 101, 95, 99, 111, 108, 108, 101, 99, 116, 111, 114]
                  },
                ]
              }
            },
            {
              name: "sequence"
              docs: [
                "message is posted, so it needs to be an [`UncheckedAccount`] for the",
                "[`initialize`](crate::initialize) instruction.",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [83, 101, 113, 117, 101, 110, 99, 101]
                  },
                  {
                    kind: "account"
                    path: "config"
                  },
                ]
              }
            },
            {
              name: "message"
              docs: ["account be mutable."]
              writable: true
              signer: true
            },
            {
              name: "payer"
              writable: true
              signer: true
            },
            {
              name: "clock"
              address: "SysvarC1ock11111111111111111111111111111111"
            },
            {
              name: "rent"
              address: "SysvarRent111111111111111111111111111111111"
            },
            {
              name: "wormholeProgram"
              docs: ["Wormhole program."]
              address: "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
            },
            {
              name: "systemProgram"
              address: "11111111111111111111111111111111"
            },
          ]
        },
      ]
      args: [
        {
          name: "payload"
          type: {
            defined: {
              name: "initTransferPayload"
            }
          }
        },
      ]
    },
    {
      name: "initialize"
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237]
      accounts: [
        {
          name: "config"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [99, 111, 110, 102, 105, 103]
              },
            ]
          }
        },
        {
          name: "authority"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [97, 117, 116, 104, 111, 114, 105, 116, 121]
              },
            ]
          }
        },
        {
          name: "solVault"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [115, 111, 108, 95, 118, 97, 117, 108, 116]
              },
            ]
          }
        },
        {
          name: "wormholeBridge"
          docs: [
            "Wormhole bridge data account (a.k.a. its config).",
            "[`wormhole::post_message`] requires this account be mutable.",
          ]
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [66, 114, 105, 100, 103, 101]
              },
            ]
          }
        },
        {
          name: "wormholeFeeCollector"
          docs: [
            "Wormhole fee collector account, which requires lamports before the",
            "program can post a message (if there is a fee).",
            "[`wormhole::post_message`] requires this account be mutable.",
          ]
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [102, 101, 101, 95, 99, 111, 108, 108, 101, 99, 116, 111, 114]
              },
            ]
          }
        },
        {
          name: "wormholeSequence"
          docs: [
            "message is posted, so it needs to be an [`UncheckedAccount`] for the",
            "[`initialize`](crate::initialize) instruction.",
            "[`wormhole::post_message`] requires this account be mutable.",
          ]
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [83, 101, 113, 117, 101, 110, 99, 101]
              },
              {
                kind: "account"
                path: "config"
              },
            ]
          }
        },
        {
          name: "wormholeMessage"
          docs: ["account be mutable."]
          writable: true
          signer: true
        },
        {
          name: "payer"
          writable: true
          signer: true
        },
        {
          name: "clock"
          address: "SysvarC1ock11111111111111111111111111111111"
        },
        {
          name: "rent"
          address: "SysvarRent111111111111111111111111111111111"
        },
        {
          name: "systemProgram"
          address: "11111111111111111111111111111111"
        },
        {
          name: "wormholeProgram"
          address: "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
        },
        {
          name: "program"
          signer: true
          address: "Gy1XPwYZURfBzHiGAxnw3SYC33SfqsEpGSS5zeBge28p"
        },
      ]
      args: [
        {
          name: "admin"
          type: "pubkey"
        },
        {
          name: "pausableAdmin"
          type: "pubkey"
        },
        {
          name: "derivedNearBridgeAddress"
          type: {
            array: ["u8", 64]
          }
        },
      ]
    },
    {
      name: "logMetadata"
      discriminator: [168, 157, 195, 79, 96, 210, 208, 2]
      accounts: [
        {
          name: "authority"
          pda: {
            seeds: [
              {
                kind: "const"
                value: [97, 117, 116, 104, 111, 114, 105, 116, 121]
              },
            ]
          }
        },
        {
          name: "mint"
        },
        {
          name: "metadata"
          optional: true
        },
        {
          name: "vault"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [118, 97, 117, 108, 116]
              },
              {
                kind: "account"
                path: "mint"
              },
            ]
          }
        },
        {
          name: "common"
          accounts: [
            {
              name: "config"
              docs: ["Used as an emitter"]
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [99, 111, 110, 102, 105, 103]
                  },
                ]
              }
            },
            {
              name: "bridge"
              docs: [
                "Wormhole bridge data account (a.k.a. its config).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [66, 114, 105, 100, 103, 101]
                  },
                ]
              }
            },
            {
              name: "feeCollector"
              docs: [
                "Wormhole fee collector account, which requires lamports before the",
                "program can post a message (if there is a fee).",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [102, 101, 101, 95, 99, 111, 108, 108, 101, 99, 116, 111, 114]
                  },
                ]
              }
            },
            {
              name: "sequence"
              docs: [
                "message is posted, so it needs to be an [`UncheckedAccount`] for the",
                "[`initialize`](crate::initialize) instruction.",
                "[`wormhole::post_message`] requires this account be mutable.",
              ]
              writable: true
              pda: {
                seeds: [
                  {
                    kind: "const"
                    value: [83, 101, 113, 117, 101, 110, 99, 101]
                  },
                  {
                    kind: "account"
                    path: "config"
                  },
                ]
              }
            },
            {
              name: "message"
              docs: ["account be mutable."]
              writable: true
              signer: true
            },
            {
              name: "payer"
              writable: true
              signer: true
            },
            {
              name: "clock"
              address: "SysvarC1ock11111111111111111111111111111111"
            },
            {
              name: "rent"
              address: "SysvarRent111111111111111111111111111111111"
            },
            {
              name: "wormholeProgram"
              docs: ["Wormhole program."]
              address: "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
            },
            {
              name: "systemProgram"
              address: "11111111111111111111111111111111"
            },
          ]
        },
        {
          name: "systemProgram"
          address: "11111111111111111111111111111111"
        },
        {
          name: "tokenProgram"
        },
        {
          name: "associatedTokenProgram"
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
      ]
      args: []
    },
    {
      name: "pause"
      discriminator: [211, 22, 221, 251, 74, 121, 193, 47]
      accounts: [
        {
          name: "config"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [99, 111, 110, 102, 105, 103]
              },
            ]
          }
        },
        {
          name: "signer"
          writable: true
          signer: true
        },
      ]
      args: []
    },
    {
      name: "setAdmin"
      discriminator: [251, 163, 0, 52, 91, 194, 187, 92]
      accounts: [
        {
          name: "config"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [99, 111, 110, 102, 105, 103]
              },
            ]
          }
        },
        {
          name: "signer"
          writable: true
          signer: true
        },
      ]
      args: [
        {
          name: "admin"
          type: "pubkey"
        },
      ]
    },
    {
      name: "setPausableAdmin"
      discriminator: [128, 59, 6, 173, 50, 0, 213, 197]
      accounts: [
        {
          name: "config"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [99, 111, 110, 102, 105, 103]
              },
            ]
          }
        },
        {
          name: "signer"
          writable: true
          signer: true
        },
      ]
      args: [
        {
          name: "pausableAdmin"
          type: "pubkey"
        },
      ]
    },
    {
      name: "unpause"
      discriminator: [169, 144, 4, 38, 10, 141, 188, 255]
      accounts: [
        {
          name: "config"
          writable: true
          pda: {
            seeds: [
              {
                kind: "const"
                value: [99, 111, 110, 102, 105, 103]
              },
            ]
          }
        },
        {
          name: "signer"
          writable: true
          signer: true
        },
      ]
      args: [
        {
          name: "paused"
          type: "u8"
        },
      ]
    },
  ]
  accounts: [
    {
      name: "config"
      discriminator: [155, 12, 170, 224, 30, 250, 204, 130]
    },
    {
      name: "usedNonces"
      discriminator: [60, 112, 18, 72, 138, 181, 100, 138]
    },
  ]
  errors: [
    {
      code: 6000
      name: "invalidArgs"
      msg: "Invalid arguments"
    },
    {
      code: 6001
      name: "signatureVerificationFailed"
      msg: "Signature verification failed"
    },
    {
      code: 6002
      name: "malleableSignature"
      msg: "Malleable signature"
    },
    {
      code: 6003
      name: "nonceAlreadyUsed"
      msg: "Nonce already used"
    },
    {
      code: 6004
      name: "tokenMetadataNotProvided"
      msg: "Token metadata not provided"
    },
    {
      code: 6005
      name: "invalidTokenMetadataAddress"
      msg: "Invalid token metadata address"
    },
    {
      code: 6006
      name: "invalidBridgedToken"
      msg: "Invalid bridged token"
    },
    {
      code: 6007
      name: "invalidFee"
      msg: "Invalid fee"
    },
    {
      code: 6008
      name: "paused"
      msg: "paused"
    },
    {
      code: 6009
      name: "unauthorized"
      msg: "unauthorized"
    },
  ]
  types: [
    {
      name: "config"
      type: {
        kind: "struct"
        fields: [
          {
            name: "admin"
            type: "pubkey"
          },
          {
            name: "maxUsedNonce"
            type: "u64"
          },
          {
            name: "derivedNearBridgeAddress"
            type: {
              array: ["u8", 64]
            }
          },
          {
            name: "bumps"
            type: {
              defined: {
                name: "configBumps"
              }
            }
          },
          {
            name: "paused"
            type: "u8"
          },
          {
            name: "pausableAdmin"
            type: "pubkey"
          },
          {
            name: "padding"
            type: {
              array: ["u8", 67]
            }
          },
        ]
      }
    },
    {
      name: "configBumps"
      type: {
        kind: "struct"
        fields: [
          {
            name: "config"
            type: "u8"
          },
          {
            name: "authority"
            type: "u8"
          },
          {
            name: "solVault"
            type: "u8"
          },
          {
            name: "wormhole"
            type: {
              defined: {
                name: "wormholeBumps"
              }
            }
          },
        ]
      }
    },
    {
      name: "deployTokenPayload"
      type: {
        kind: "struct"
        fields: [
          {
            name: "token"
            type: "string"
          },
          {
            name: "name"
            type: "string"
          },
          {
            name: "symbol"
            type: "string"
          },
          {
            name: "decimals"
            type: "u8"
          },
        ]
      }
    },
    {
      name: "finalizeTransferPayload"
      type: {
        kind: "struct"
        fields: [
          {
            name: "destinationNonce"
            type: "u64"
          },
          {
            name: "transferId"
            type: {
              defined: {
                name: "transferId"
              }
            }
          },
          {
            name: "amount"
            type: "u128"
          },
          {
            name: "feeRecipient"
            type: {
              option: "string"
            }
          },
        ]
      }
    },
    {
      name: "initTransferPayload"
      type: {
        kind: "struct"
        fields: [
          {
            name: "amount"
            type: "u128"
          },
          {
            name: "recipient"
            type: "string"
          },
          {
            name: "fee"
            type: "u128"
          },
          {
            name: "nativeFee"
            type: "u64"
          },
          {
            name: "message"
            type: "string"
          },
        ]
      }
    },
    {
      name: "signedPayload"
      generics: [
        {
          kind: "type"
          name: "p"
        },
      ]
      type: {
        kind: "struct"
        fields: [
          {
            name: "payload"
            type: {
              generic: "p"
            }
          },
          {
            name: "signature"
            type: {
              array: ["u8", 65]
            }
          },
        ]
      }
    },
    {
      name: "transferId"
      type: {
        kind: "struct"
        fields: [
          {
            name: "originChain"
            type: "u8"
          },
          {
            name: "originNonce"
            type: "u64"
          },
        ]
      }
    },
    {
      name: "usedNonces"
      serialization: "bytemuckunsafe"
      repr: {
        kind: "c"
      }
      type: {
        kind: "struct"
        fields: []
      }
    },
    {
      name: "wormholeBumps"
      type: {
        kind: "struct"
        fields: [
          {
            name: "bridge"
            type: "u8"
          },
          {
            name: "feeCollector"
            type: "u8"
          },
          {
            name: "sequence"
            type: "u8"
          },
        ]
      }
    },
  ]
  constants: [
    {
      name: "allPaused"
      type: "u8"
      value: "3"
    },
    {
      name: "allUnpaused"
      type: "u8"
      value: "0"
    },
    {
      name: "authoritySeed"
      type: "bytes"
      value: "[97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      name: "configSeed"
      type: "bytes"
      value: "[99, 111, 110, 102, 105, 103]"
    },
    {
      name: "finalizeTransferPaused"
      type: "u8"
      value: "2"
    },
    {
      name: "initTransferPaused"
      type: "u8"
      value: "1"
    },
    {
      name: "maxAllowedDecimals"
      type: "u8"
      value: "9"
    },
    {
      name: "metadataSeed"
      type: "bytes"
      value: "[109, 101, 116, 97, 100, 97, 116, 97]"
    },
    {
      name: "solanaOmniBridgeChainId"
      type: "u8"
      value: "2"
    },
    {
      name: "solVaultSeed"
      type: "bytes"
      value: "[115, 111, 108, 95, 118, 97, 117, 108, 116]"
    },
    {
      name: "usedNoncesAccountSize"
      type: "u32"
      value: "136"
    },
    {
      name: "usedNoncesPerAccount"
      type: "u32"
      value: "1024"
    },
    {
      name: "usedNoncesSeed"
      type: "bytes"
      value: "[117, 115, 101, 100, 95, 110, 111, 110, 99, 101, 115]"
    },
    {
      name: "vaultSeed"
      type: "bytes"
      value: "[118, 97, 117, 108, 116]"
    },
    {
      name: "wrappedMintSeed"
      type: "bytes"
      value: "[119, 114, 97, 112, 112, 101, 100, 95, 109, 105, 110, 116]"
    },
  ]
}
