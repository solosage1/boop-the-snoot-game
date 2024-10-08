const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe("MerkleRewardSystem Integration Tests", function () {
  let merkleRewardSystem;
  let rewardToken;
  let lpToken;
  let owner;

  const OWNER_PRIVATE_KEY = process.env.PRIVATE_KEY;
  const DEPLOYED_CONTRACT_ADDRESS = process.env.DEPLOYED_CONTRACT_ADDRESS;
  const REWARD_TOKEN_ADDRESS = process.env.REWARD_TOKEN_ADDRESS;
  const LP_TOKEN_ADDRESS = process.env.LP_TOKEN_ADDRESS;
  const RPC_URL = process.env.BARTIO_RPC_URL;

  before(async function () {
    // Set up provider and signer
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const ownerWallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
    owner = ownerWallet;

    // Get contract instance
    const MerkleRewardSystem = await ethers.getContractFactory("MerkleRewardSystem", owner);
    merkleRewardSystem = MerkleRewardSystem.attach(DEPLOYED_CONTRACT_ADDRESS);

    // Connect to existing Reward Token
    const ERC20_ABI = [
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
      "function name() view returns (string)",
      "function totalSupply() view returns (uint256)",
      "function balanceOf(address owner) view returns (uint256)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function transfer(address to, uint256 amount) returns (bool)",
      "function transferFrom(address from, address to, uint256 amount) returns (bool)",
      "function mint(address to, uint256 amount) external" // Ensure mint function exists
    ];

    rewardToken = new ethers.Contract(REWARD_TOKEN_ADDRESS, ERC20_ABI, owner);
    lpToken = new ethers.Contract(LP_TOKEN_ADDRESS, ERC20_ABI, owner);

    // Mint reward tokens to the owner if necessary
    const mintAmount = ethers.utils.parseEther("1000");
    const ownerRewardBalance = await rewardToken.balanceOf(owner.address);
    if (ownerRewardBalance.lt(mintAmount)) {
      await rewardToken.mint(owner.address, mintAmount.sub(ownerRewardBalance));
      console.log("Minted reward tokens to the owner.");
    }

    // Approve reward tokens to the MerkleRewardSystem contract
    const approveTx = await rewardToken.approve(merkleRewardSystem.address, ethers.utils.parseEther("1000"));
    await approveTx.wait();
    console.log("Approved reward tokens to MerkleRewardSystem.");

    // Whitelist the reward token
    const isRewardTokenWhitelisted = await merkleRewardSystem.whitelistedTokens(rewardToken.address);
    if (!isRewardTokenWhitelisted) {
      console.log("Whitelisting reward token...");
      const whitelistRewardTokenTx = await merkleRewardSystem.whitelistToken(rewardToken.address);
      await whitelistRewardTokenTx.wait();
      console.log("Reward token whitelisted.");
    } else {
      console.log("Reward token already whitelisted.");
    }

    // Whitelist the LP token if necessary
    const isLPTokenWhitelisted = await merkleRewardSystem.whitelistedTokens(lpToken.address);
    if (!isLPTokenWhitelisted) {
      console.log("Whitelisting LP token...");
      const whitelistLPTokenTx = await merkleRewardSystem.whitelistToken(lpToken.address);
      await whitelistLPTokenTx.wait();
      console.log("LP token whitelisted.");
    } else {
      console.log("LP token already whitelisted.");
    }

    // Check and log balances and allowances
    const ownerBalance = await rewardToken.balanceOf(owner.address);
    console.log("Owner reward token balance:", ethers.utils.formatEther(ownerBalance));

    const allowance = await rewardToken.allowance(owner.address, merkleRewardSystem.address);
    console.log("Reward token allowance:", ethers.utils.formatEther(allowance));
  });

  describe("Campaign Creation Edge Cases", function () {
    it("Should fail to create a campaign with end time before start time", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 3600; // Starts in 1 hour
      const endTimestamp = currentTimestamp + 60;     // Ends in 1 minute (before start time)

      await expect(
        merkleRewardSystem.connect(owner).createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          startTimestamp,
          endTimestamp,
          ethers.utils.parseEther("1000")
        )
      ).to.be.revertedWith("InvalidCampaignDuration");
    });

    it("Should correctly assign IDs to multiple campaigns", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;

      const campaignCount = 5;
      for (let i = 0; i < campaignCount; i++) {
        const startTimestamp = currentTimestamp + 60 + i * 100;
        const endTimestamp = startTimestamp + 3600;

        await merkleRewardSystem.connect(owner).createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          startTimestamp,
          endTimestamp,
          ethers.utils.parseEther("100")
        );

        const campaign = await merkleRewardSystem.campaigns(i);
        expect(campaign.creator).to.equal(owner.address);
      }

      // Ensure campaignCount is accessed correctly
      const actualCampaignCount = await merkleRewardSystem.campaignCount();
      expect(actualCampaignCount).to.equal(campaignCount);
    });

    // Additional edge case tests can be added here
  });

  describe("Merkle Root Updates", function () {
    it("Should allow the updater to update global Merkle root", async function () {
      const newRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("new merkle root"));

      await merkleRewardSystem.connect(updater).updateGlobalRoot(newRoot, (await ethers.provider.getBlock('latest')).timestamp);

      const updatedRoot = await merkleRewardSystem.globalMerkleRoot();
      expect(updatedRoot).to.equal(newRoot);
    });

    it("Should prevent non-updaters from updating Merkle roots", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      await merkleRewardSystem.connect(owner).createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        startTimestamp,
        endTimestamp,
        ethers.utils.parseEther("1000")
      );

      const newRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("new merkle root"));

      await expect(
        merkleRewardSystem.connect(user1Wallet).updateGlobalRoot(newRoot, (await ethers.provider.getBlock('latest')).timestamp)
      ).to.be.revertedWith("AccessControl:");
    });

    // Additional tests for Merkle root updates
  });

  describe("Complex Reward Claiming", function () {
    it("Should allow claiming rewards from multiple campaigns", async function () {
      // Create multiple campaigns
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;

      for (let i = 0; i < 2; i++) {
        const startTimestamp = currentTimestamp + 60;
        const endTimestamp = startTimestamp + 3600;

        await merkleRewardSystem.connect(owner).createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          startTimestamp,
          endTimestamp,
          ethers.utils.parseEther("1000")
        );

        // Fund the contract for each campaign
        await rewardToken.connect(owner).transfer(merkleRewardSystem.address, ethers.utils.parseEther("1000"));
      }

      // Prepare cumulative amounts for multiple campaigns
      const cumulativeAmounts = [ethers.utils.parseEther("100"), ethers.utils.parseEther("250")]; // Cumulative amounts
      const campaignIds = [0, 1];

      // Create leaves with cumulative amounts
      const leaves = campaignIds.map((campaignId, index) =>
        ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'uint256'],
          [campaignId, user1Wallet.address, cumulativeAmounts[index]]
        )
      );

      // Generate Merkle tree and root
      const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
      const root = merkleTree.getHexRoot();

      // Update Merkle root
      await merkleRewardSystem.connect(updater).updateGlobalRoot(root, (await ethers.provider.getBlock('latest')).timestamp);

      // Fast forward time to campaign start
      await network.provider.send("evm_increaseTime", [70]);
      await network.provider.send("evm_mine");

      // Get proofs
      const proofs = leaves.map(leaf => merkleTree.getHexProof(leaf));

      // Claim rewards with cumulative amounts
      await merkleRewardSystem.connect(user1Wallet).claimRewards(
        campaignIds,
        cumulativeAmounts,
        proofs
      );

      // Verify claimed amounts
      for (let i = 0; i < campaignIds.length; i++) {
        const claimedAmount = await merkleRewardSystem.userClaims(campaignIds[i], user1Wallet.address);
        expect(claimedAmount).to.equal(cumulativeAmounts[i]);
      }
    });

    it("Should fail to claim with invalid proofs", async function () {
      // Set up similar to previous test, but use incorrect proofs
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      await merkleRewardSystem.connect(owner).createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        startTimestamp,
        endTimestamp,
        ethers.utils.parseEther("1000")
      );

      await rewardToken.connect(owner).transfer(merkleRewardSystem.address, ethers.utils.parseEther("1000"));

      const amount = ethers.utils.parseEther("100");
      const campaignId = 0;

      // Incorrect leaf
      const incorrectLeaf = ethers.utils.solidityKeccak256(
        ['uint256', 'address', 'uint256'],
        [campaignId, user1Wallet.address, ethers.utils.parseEther("200")] // Wrong amount
      );

      const merkleTree = new MerkleTree([incorrectLeaf], keccak256, { sortPairs: true });
      const root = merkleTree.getHexRoot();

      // Update Merkle root
      await merkleRewardSystem.connect(updater).updateGlobalRoot(root, (await ethers.provider.getBlock('latest')).timestamp);

      // Fast forward time to campaign start
      await network.provider.send("evm_increaseTime", [70]);
      await network.provider.send("evm_mine");

      // Correct leaf for user claim
      const correctLeaf = ethers.utils.solidityKeccak256(
        ['uint256', 'address', 'uint256'],
        [campaignId, user1Wallet.address, amount]
      );

      const proof = merkleTree.getHexProof(correctLeaf);

      // Attempt to claim
      await expect(
        merkleRewardSystem.connect(user1Wallet).claimRewards(
          [campaignId],
          [amount],
          [proof]
        )
      ).to.be.revertedWith("InvalidProof");
    });

    it("Should fail to claim with invalid cumulative amount", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      await merkleRewardSystem.connect(owner).createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        startTimestamp,
        endTimestamp,
        ethers.utils.parseEther("1000")
      );

      await rewardToken.connect(owner).transfer(merkleRewardSystem.address, ethers.utils.parseEther("1000"));

      const amount = ethers.utils.parseEther("100");
      const campaignId = 0;

      // Correct leaf for user claim
      const leaf = ethers.utils.solidityKeccak256(
        ['uint256', 'address', 'uint256'],
        [campaignId, user1Wallet.address, amount]
      );

      const merkleTree = new MerkleTree([leaf], keccak256, { sortPairs: true });
      const root = merkleTree.getHexRoot();

      // Update Merkle root
      await merkleRewardSystem.connect(updater).updateGlobalRoot(root, (await ethers.provider.getBlock('latest')).timestamp);

      // Fast forward time to campaign start
      await network.provider.send("evm_increaseTime", [70]);
      await network.provider.send("evm_mine");

      const proof = merkleTree.getHexProof(leaf);

      // Claim once
      await merkleRewardSystem.connect(user1Wallet).claimRewards(
        [campaignId],
        [amount],
        [proof]
      );

      // Attempt to claim with less than already claimed
      await expect(
        merkleRewardSystem.connect(user1Wallet).claimRewards(
          [campaignId],
          [ethers.utils.parseEther("50")], // Less than already claimed
          [proof]
        )
      ).to.be.revertedWith("InvalidProof");
    });

    // Additional complex claiming scenarios
  });

  describe("Withdrawal Restrictions", function () {
    it("Should prevent withdrawal before cooldown periods", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      await merkleRewardSystem.connect(owner).createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        startTimestamp,
        endTimestamp,
        ethers.utils.parseEther("1000")
      );

      await rewardToken.connect(owner).transfer(merkleRewardSystem.address, ethers.utils.parseEther("1000"));

      // Attempt to withdraw before campaign ends
      await expect(
        merkleRewardSystem.connect(owner).withdrawRewardTokens(0, ethers.utils.parseEther("1000"))
      ).to.be.revertedWith("CooldownPeriodNotPassed");

      // Fast forward time to campaign end
      await network.provider.send("evm_increaseTime", [endTimestamp - currentTimestamp + 1]);
      await network.provider.send("evm_mine");

      // Attempt to withdraw before cooldown period
      await expect(
        merkleRewardSystem.connect(owner).withdrawRewardTokens(0, ethers.utils.parseEther("1000"))
      ).to.be.revertedWith("CooldownPeriodNotPassed");
    });

    it("Should prevent withdrawing more than available rewards", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      await merkleRewardSystem.connect(owner).createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        startTimestamp,
        endTimestamp,
        ethers.utils.parseEther("1000")
      );

      await rewardToken.connect(owner).transfer(merkleRewardSystem.address, ethers.utils.parseEther("1000"));

      // Fast forward time to after cooldown period
      const CREATOR_COOLDOWN_PERIOD = 30 * 24 * 60 * 60; // 30 days in seconds
      await network.provider.send("evm_increaseTime", [endTimestamp - currentTimestamp + CREATOR_COOLDOWN_PERIOD + 10]);
      await network.provider.send("evm_mine");

      // Attempt to withdraw more than balance
      await expect(
        merkleRewardSystem.connect(owner).withdrawRewardTokens(0, ethers.utils.parseEther("2000"))
      ).to.be.revertedWith("InsufficientBalance");
    });

    // Additional tests for withdrawal restrictions
  });
});