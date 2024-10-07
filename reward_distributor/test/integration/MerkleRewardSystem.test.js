// test/integration/MerkleRewardSystem.test.js

const { expect } = require("chai");
const { ethers } = require("ethers"); // Note: We import ethers from 'ethers' instead of 'hardhat'
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
require("dotenv").config({ path: "./.env" }); // Ensure the .env file is loaded

// Define the ERC20 ABI with necessary functions
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)"
];

describe("MerkleRewardSystem Integration Tests", function () {
  let merkleRewardSystem,
    owner,
    user1Wallet,
    user2Wallet,
    rewardToken,
    lpToken;
  const ADMIN_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("ADMIN_ROLE")
  );
  const UPDATER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("UPDATER_ROLE")
  );
  let ownerLPBalance, campaignRewardAmount;
  let campaignId;
  let rewardTokenDecimals, lpTokenDecimals;
  let provider;

  // Increase the timeout for the entire test suite
  this.timeout(600000); // 10 minutes

  before(async function () {
    try {
      // Load environment variables
      const {
        PRIVATE_KEY,
        BARTIO_RPC_URL,
        DEPLOYED_CONTRACT_ADDRESS,
        LP_TOKEN_ADDRESS,
        REWARD_TOKEN_ADDRESS,
      } = process.env;

      // Ensure environment variables are defined
      if (!PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY is not defined in the .env file.");
      }
      if (!BARTIO_RPC_URL) {
        throw new Error("BARTIO_RPC_URL is not defined in the .env file.");
      }
      if (!DEPLOYED_CONTRACT_ADDRESS) {
        throw new Error("DEPLOYED_CONTRACT_ADDRESS is not defined in the .env file.");
      }
      if (!LP_TOKEN_ADDRESS) {
        throw new Error("LP_TOKEN_ADDRESS is not defined in the .env file.");
      }
      if (!REWARD_TOKEN_ADDRESS) {
        throw new Error("REWARD_TOKEN_ADDRESS is not defined in the .env file.");
      }

      // Set up the provider
      provider = new ethers.providers.JsonRpcProvider(BARTIO_RPC_URL);

      // Create the owner wallet from the private key and connect to provider
      owner = new ethers.Wallet(PRIVATE_KEY, provider);
      console.log("Owner address:", owner.address);

      // Create two new wallets for testing and connect to provider
      user1Wallet = ethers.Wallet.createRandom().connect(provider);
      user2Wallet = ethers.Wallet.createRandom().connect(provider);
      console.log("User1 address:", user1Wallet.address);
      console.log("User2 address:", user2Wallet.address);

      // Connect to the existing MerkleRewardSystem contract
      const merkleRewardSystemABI = require("../../artifacts/contracts/MerkleRewardSystem.sol/MerkleRewardSystem.json").abi;
      merkleRewardSystem = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS,
        merkleRewardSystemABI,
        owner
      );
      console.log(
        "MerkleRewardSystem connected at address:",
        merkleRewardSystem.address
      );

      // Connect to the LP token using ERC20_ABI
      lpToken = new ethers.Contract(
        LP_TOKEN_ADDRESS,
        ERC20_ABI,
        owner
      );
      console.log("LPToken connected at address:", lpToken.address);

      // Connect to the reward token using ERC20_ABI
      rewardToken = new ethers.Contract(
        REWARD_TOKEN_ADDRESS,
        ERC20_ABI,
        owner
      );
      console.log("RewardToken connected at address:", rewardToken.address);

      // Get token decimals
      lpTokenDecimals = await lpToken.decimals();
      console.log("LP Token Decimals:", lpTokenDecimals);

      rewardTokenDecimals = await rewardToken.decimals();
      console.log("Reward Token Decimals:", rewardTokenDecimals);

      // Ensure owner has necessary roles
      if (!(await merkleRewardSystem.hasRole(ADMIN_ROLE, owner.address))) {
        const grantAdminRoleTx = await merkleRewardSystem.grantRole(ADMIN_ROLE, owner.address);
        await grantAdminRoleTx.wait();
        console.log("ADMIN_ROLE granted to owner");
      }
      if (!(await merkleRewardSystem.hasRole(UPDATER_ROLE, owner.address))) {
        const grantUpdaterRoleTx = await merkleRewardSystem.grantRole(UPDATER_ROLE, owner.address);
        await grantUpdaterRoleTx.wait();
        console.log("UPDATER_ROLE granted to owner");
      }

      // Whitelist tokens if necessary
      if (!(await merkleRewardSystem.whitelistedTokens(rewardToken.address))) {
        const whitelistRewardTokenTx = await merkleRewardSystem.whitelistToken(rewardToken.address);
        await whitelistRewardTokenTx.wait();
        console.log("RewardToken whitelisted");
      }

      // Verify Owner's LP Token Balance
      ownerLPBalance = await lpToken.balanceOf(owner.address);
      console.log(
        "Owner LP Token Balance:",
        ethers.utils.formatUnits(ownerLPBalance, lpTokenDecimals)
      );

      // Calculate 10% of owner's LP balance for the campaign
      campaignRewardAmount = ownerLPBalance.mul(10).div(100);
      console.log(
        "Campaign Reward Amount (10% of owner's balance):",
        ethers.utils.formatUnits(campaignRewardAmount, lpTokenDecimals)
      );

      // Ensure Owner has enough LP Tokens
      if (campaignRewardAmount.isZero()) {
        throw new Error(
          "Owner's LP token balance is too low to create a campaign with 10% of the balance."
        );
      }

      // Check owner's ETH balance
      const ownerEthBalance = await provider.getBalance(owner.address);
      console.log(
        "Owner ETH Balance:",
        ethers.utils.formatEther(ownerEthBalance)
      );

      // Transfer a small amount of ETH to user wallets for gas
      const transferAmount = ethers.utils.parseEther("0.01");
      if (ownerEthBalance.gt(transferAmount.mul(2))) {
        const tx1 = await owner.sendTransaction({
          to: user1Wallet.address,
          value: transferAmount
        });
        await tx1.wait();

        const tx2 = await owner.sendTransaction({
          to: user2Wallet.address,
          value: transferAmount
        });
        await tx2.wait();

        console.log("Transferred 0.01 ETH to each user wallet for gas");
      } else {
        console.log(
          "Owner doesn't have enough ETH to transfer. Skipping ETH transfer to user wallets."
        );
      }

      // Transfer LP Tokens to users
      const userLPAmount = ownerLPBalance.mul(5).div(100);
      if (userLPAmount.isZero()) {
        throw new Error(
          "User LP token amount is zero. Cannot transfer tokens to users."
        );
      }

      const transferLPtoUser1Tx = await lpToken.transfer(user1Wallet.address, userLPAmount);
      await transferLPtoUser1Tx.wait();

      const transferLPtoUser2Tx = await lpToken.transfer(user2Wallet.address, userLPAmount);
      await transferLPtoUser2Tx.wait();

      // Display user LP token balances
      const user1LPBalance = await lpToken.balanceOf(user1Wallet.address);
      const user2LPBalance = await lpToken.balanceOf(user2Wallet.address);
      console.log(
        "User1 LP Token Balance:",
        ethers.utils.formatUnits(user1LPBalance, lpTokenDecimals)
      );
      console.log(
        "User2 LP Token Balance:",
        ethers.utils.formatUnits(user2LPBalance, lpTokenDecimals)
      );

      // Ensure owner has enough reward tokens to fund the campaign
      const ownerRewardBalance = await rewardToken.balanceOf(owner.address);
      console.log(
        "Owner reward token balance:",
        ethers.utils.formatUnits(ownerRewardBalance, rewardTokenDecimals)
      );

      if (ownerRewardBalance.lt(campaignRewardAmount)) {
        throw new Error(
          "Owner does not have enough reward tokens to fund the campaign."
        );
      }

      // Approve the MerkleRewardSystem to spend rewardTokens
      const approveRewardTokenTx = await rewardToken.approve(merkleRewardSystem.address, campaignRewardAmount);
      await approveRewardTokenTx.wait();
      console.log("Approved MerkleRewardSystem to spend reward tokens");
    } catch (error) {
      console.error("Error in before hook:", error);
      throw error;
    }
  });

  it("Should create a campaign", async function () {
    try {
      const currentBlock = await provider.getBlockNumber();
      const startBlock = currentBlock + 5;
      const campaignDurationBlocks = 25; // Campaign lasts 25 blocks
      const endBlock = startBlock + campaignDurationBlocks;

      const maxRewardRate = campaignRewardAmount.div(campaignDurationBlocks);
      console.log("Creating campaign with params:", {
        rewardToken: rewardToken.address,
        lpToken: lpToken.address,
        maxRewardRate: ethers.utils.formatUnits(
          maxRewardRate,
          rewardTokenDecimals
        ),
        startBlock,
        endBlock
      });

      const createCampaignTx = await merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        maxRewardRate,
        startBlock,
        endBlock,
        campaignRewardAmount // Include totalRewardAmount
      );
      const receipt = await createCampaignTx.wait();

      const campaignCreatedEvent = receipt.events.find(
        (event) => event.event === "CampaignCreated"
      );
      if (!campaignCreatedEvent) {
        throw new Error("CampaignCreated event not found in transaction receipt");
      }

      campaignId = campaignCreatedEvent.args.campaignId;
      console.log("Campaign created with ID:", campaignId.toString());

      const campaign = await merkleRewardSystem.campaigns(campaignId);
      expect(campaign.creator).to.equal(owner.address);
      expect(campaign.rewardToken).to.equal(rewardToken.address);
      expect(campaign.lpToken).to.equal(lpToken.address);

      const estimatedDurationSeconds = campaignDurationBlocks * 3; // Assuming 3 seconds per block
      console.log(`Estimated campaign duration: ${estimatedDurationSeconds} seconds`);
    } catch (error) {
      console.error("Error in createCampaign:", error);
      throw error;
    }
  });

  it("Should update Merkle root and allow users to claim rewards multiple times", async function () {
    try {
      if (campaignId === undefined) {
        throw new Error("Campaign ID is undefined. Skipping test.");
      }

      const totalRewardAmount = campaignRewardAmount;

      // Distribute rewards to users
      const users = [user1Wallet, user2Wallet];
      const userTotalEntitlement = totalRewardAmount.div(users.length);

      // Initialize total claimed amounts per user
      const userClaimedAmounts = {};
      users.forEach((user) => {
        userClaimedAmounts[user.address] = ethers.BigNumber.from(0);
      });

      // Construct Merkle Tree with total entitlements
      const leaves = users.map((user) =>
        keccak256(
          ethers.utils.solidityPack(
            ["uint256", "address", "uint256"],
            [campaignId, user.address, userTotalEntitlement]
          )
        )
      );

      const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
      const root = merkleTree.getHexRoot();
      console.log("Merkle Root:", root);

      // Wait until campaign starts
      const campaign = await merkleRewardSystem.campaigns(campaignId);
      const startBlock = campaign.startBlock.toNumber();
      console.log(`Waiting for campaign to start at block ${startBlock}...`);
      while ((await provider.getBlockNumber()) < startBlock) {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
      }

      const updateBlock = await provider.getBlockNumber();
      console.log("Updating global Merkle root at block:", updateBlock);

      // Update the Merkle root
      const updateRootTx = await merkleRewardSystem.updateGlobalRoot(
        root,
        updateBlock
      );
      await updateRootTx.wait();
      console.log("Global Merkle root updated");

      // Users claim rewards in multiple increments
      const claimRounds = 3; // Number of times users will claim
      for (let round = 1; round <= claimRounds; round++) {
        console.log(`\n--- Claim Round ${round} ---`);
        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          const leaf = keccak256(
            ethers.utils.solidityPack(
              ["uint256", "address", "uint256"],
              [campaignId, user.address, userTotalEntitlement]
            )
          );
          const proof = merkleTree.getHexProof(leaf);
          const totalEntitledAmount = userTotalEntitlement;
          const remainingEntitlement = totalEntitledAmount.sub(
            userClaimedAmounts[user.address]
          );
          if (remainingEntitlement.isZero()) {
            console.log(
              `User ${i + 1} (${user.address}) has already claimed all their entitlement.`
            );
            continue;
          }

          // User decides to claim a portion of their remaining entitlement
          const claimAmount = remainingEntitlement.div(
            claimRounds - round + 1
          ); // Divide remaining amount by remaining rounds

          // Ensure claimAmount is not zero
          if (claimAmount.isZero()) {
            console.log(
              `User ${i + 1} (${user.address}) claim amount is zero. Skipping.`
            );
            continue;
          }

          // Log user's balances before claim
          const userRewardBalanceBefore = await rewardToken.balanceOf(
            user.address
          );
          console.log(
            `User ${i + 1} (${user.address}) reward balance before claim:`,
            ethers.utils.formatUnits(userRewardBalanceBefore, rewardTokenDecimals)
          );

          // Connect user wallet to the contract
          const merkleRewardSystemUser = merkleRewardSystem.connect(user);

          // Claim rewards
          try {
            const claimTx = await merkleRewardSystemUser.claimReward(
              campaignId,
              totalEntitledAmount,
              proof,
              claimAmount
            );
            await claimTx.wait();
            console.log(
              `User ${i + 1} claimed ${ethers.utils.formatUnits(
                claimAmount,
                rewardTokenDecimals
              )} tokens successfully`
            );
          } catch (error) {
            console.error(
              `Error during claimReward for User ${i + 1} (${user.address}):`,
              error
            );
            throw error;
          }

          // Update user's claimed amount
          userClaimedAmounts[user.address] = userClaimedAmounts[
            user.address
          ].add(claimAmount);

          // Log user's balances after claim
          const userRewardBalanceAfter = await rewardToken.balanceOf(
            user.address
          );
          console.log(
            `User ${i + 1} (${user.address}) reward balance after claim:`,
            ethers.utils.formatUnits(userRewardBalanceAfter, rewardTokenDecimals)
          );

          // Verify that the user received the correct amount
          expect(userRewardBalanceAfter.sub(userRewardBalanceBefore)).to.equal(
            claimAmount
          );
        }
      }

      // Verify that users have claimed their total entitlement
      users.forEach((user, index) => {
        expect(userClaimedAmounts[user.address]).to.equal(userTotalEntitlement);
        console.log(
          `User ${index + 1} (${user.address}) total claimed: ${ethers.utils.formatUnits(
            userClaimedAmounts[user.address],
            rewardTokenDecimals
          )}`
        );
      });
    } catch (error) {
      console.error("Error in claim rewards test:", error);
      throw error;
    }
  });

  it("Should allow withdrawal of unclaimed rewards after campaign end", async function () {
    this.timeout(300000); // 5 minutes timeout for this test

    try {
      if (campaignId === undefined) {
        throw new Error("Campaign ID is undefined. Skipping test.");
      }

      console.log("Waiting for campaign to end...");

      // Get the campaign details
      const campaign = await merkleRewardSystem.campaigns(campaignId);

      // Function to wait for campaign to end
      const waitForCampaignEnd = async () => {
        const startTime = Date.now();
        while (true) {
          const currentBlock = await provider.getBlockNumber();
          if (currentBlock > campaign.endBlock) {
            break;
          }
          if (Date.now() - startTime > 240000) {
            // 4 minutes
            throw new Error("Timeout waiting for campaign to end");
          }
          await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds before checking again
          console.log(
            `Current block: ${currentBlock}, End block: ${campaign.endBlock}`
          );
        }
      };

      await waitForCampaignEnd();

      console.log(
        "Campaign has ended. Current block:",
        await provider.getBlockNumber()
      );

      // Log campaign details
      const campaignDetails = await merkleRewardSystem.campaigns(campaignId);
      console.log("Campaign details:", {
        creator: campaignDetails.creator,
        rewardToken: campaignDetails.rewardToken,
        totalRewards: ethers.utils.formatUnits(
          campaignDetails.totalRewards,
          rewardTokenDecimals
        ),
        claimedRewards: ethers.utils.formatUnits(
          campaignDetails.claimedRewards,
          rewardTokenDecimals
        )
      });

      // Check contract's reward token balance
      const contractBalance = await rewardToken.balanceOf(
        merkleRewardSystem.address
      );
      console.log(
        "Contract reward token balance:",
        ethers.utils.formatUnits(contractBalance, rewardTokenDecimals)
      );

      const initialBalance = await rewardToken.balanceOf(owner.address);
      console.log(
        "Initial owner balance:",
        ethers.utils.formatUnits(initialBalance, rewardTokenDecimals)
      );

      const availableRewards = campaignDetails.totalRewards.sub(
        campaignDetails.claimedRewards
      );
      console.log(
        "Available rewards:",
        ethers.utils.formatUnits(availableRewards, rewardTokenDecimals)
      );

      if (availableRewards.eq(0)) {
        console.log(
          "No rewards available for withdrawal. Skipping withdrawal test."
        );
        return;
      }

      try {
        const withdrawTx = await merkleRewardSystem.withdrawRewardTokens(
          campaignId,
          availableRewards
        );
        const withdrawReceipt = await withdrawTx.wait();
        console.log("Withdrawal transaction completed:", withdrawReceipt.transactionHash);
      } catch (error) {
        console.error("Withdrawal transaction failed:", error);
        if (error.reason) {
          console.error("Revert reason:", error.reason);
        }
        throw error;
      }

      const finalBalance = await rewardToken.balanceOf(owner.address);
      console.log(
        "Final owner balance:",
        ethers.utils.formatUnits(finalBalance, rewardTokenDecimals)
      );
      console.log(
        "Balance difference:",
        ethers.utils.formatUnits(
          finalBalance.sub(initialBalance),
          rewardTokenDecimals
        )
      );

      expect(finalBalance.sub(initialBalance)).to.equal(availableRewards);
    } catch (error) {
      console.error("Error in withdrawRewardTokens:", error);
      throw error;
    }
  });

  // Additional advanced tests can be added here...
});
