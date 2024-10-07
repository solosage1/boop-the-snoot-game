require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
require("solidity-coverage");
require("@nomicfoundation/hardhat-verify");

module.exports = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    bartio_testnet: {
      url: process.env.BARTIO_RPC_URL || 'https://artio.rpc.berachain.com/',
      accounts: [process.env.PRIVATE_KEY],
      chainId: 80084,
      gasPrice: 1000000000, // 1 gwei
      timeout: 60000 // 1 minute
    },
  },
  etherscan: {
    apiKey: {
      bartio_testnet: process.env.BARTIO_API_KEY || "bartio_testnet",
    },
    customChains: [
      {
        network: "bartio_testnet",
        chainId: 80084,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/testnet/evm/80084/etherscan",
          browserURL: "https://artio.beratrail.io"
        }
      }
    ]
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  mocha: {
    timeout: 300000 // 5 minutes
  }
};