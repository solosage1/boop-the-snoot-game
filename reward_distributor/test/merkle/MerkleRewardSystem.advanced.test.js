const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe("MerkleRewardSystem Advanced Tests", function () {
  let merkleRewardSystem, rewardToken, lpToken, owner, admin, updater;
  let user1Wallet, user2Wallet, user3Wallet;

  async function deployMerkleRewardSystemFixture() {
    const [ownerSigner, adminSigner, updaterSigner] = await ethers.getSigners();
    owner = ownerSigner;
    admin = adminSigner;
    updater = updaterSigner;

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    rewardToken = await MockERC20.deploy("Reward Token", "RWD");
    await rewardToken.deployed();

    lpToken = await MockERC20.deploy("LP Token", "LP");
    await lpToken.deployed();

    // Deploy the MerkleRewardSystem contract
    const MerkleRewardSystem = await ethers.getContractFactory("MerkleRewardSystem");
    merkleRewardSystem = await MerkleRewardSystem.deploy();
    await merkleRewardSystem.deployed();

    // Assign roles
    await merkleRewardSystem.grantRole(await merkleRewardSystem.ADMIN_ROLE(), admin.address);
    await merkleRewardSystem.grantRole(await merkleRewardSystem.UPDATER_ROLE(), updater.address);

    // Create user wallets
    user1Wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    user2Wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    user3Wallet = ethers.Wallet.createRandom().connect(ethers.provider);

    // Fund user wallets with ETH
    const wallets = [user1Wallet, user2Wallet, user3Wallet];
    for (const wallet of wallets) {
      await owner.sendTransaction({ to: wallet.address, value: ethers.utils.parseEther("1") });
    }

    // Mint and approve tokens
    const mintAmount = ethers.utils.parseEther("1000000");
    await rewardToken.mint(owner.address, mintAmount);
    await lpToken.mint(owner.address, mintAmount);

    await rewardToken.connect(owner).approve(merkleRewardSystem.address, mintAmount);
    await lpToken.connect(owner).approve(merkleRewardSystem.address, mintAmount);
  }

  beforeEach(async function () {
    await loadFixture(deployMerkleRewardSystemFixture);
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

      const totalCampaigns = await merkleRewardSystem.campaignCount();
      expect(totalCampaigns).to.equal(campaignCount);
    });

    // Additional edge case tests can be added here
  });

  describe("Merkle Root Updates", function () {
    it("Should allow the updater to update Merkle roots for campaigns", async function () {
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

      // New Merkle root
      const newRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("new merkle root"));

      await merkleRewardSystem.connect(updater).updateGlobalRoot(newRoot, (await ethers.provider.getBlock('latest')).timestamp);

      const campaign = await merkleRewardSystem.campaigns(0);
      expect(campaign.merkleRoot).to.equal(newRoot);
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

      // Prepare claims for multiple campaigns
      const amounts = [ethers.utils.parseEther("100"), ethers.utils.parseEther("150")];
      const campaignIds = [0, 1];

      // Create leaves and Merkle trees
      const leaves = campaignIds.map((campaignId, index) =>
        ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'uint256'],
          [campaignId, user1Wallet.address, amounts[index]]
        )
      );

      const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
      const root = merkleTree.getHexRoot();

      // Update Merkle roots
      await merkleRewardSystem.connect(updater).updateGlobalRoot(root, (await ethers.provider.getBlock('latest')).timestamp);

      // Fast forward time to campaign start
      await network.provider.send("evm_increaseTime", [70]);
      await network.provider.send("evm_mine");

      // Get proofs
      const proofs = leaves.map(leaf => merkleTree.getHexProof(leaf));

      // Claim rewards
      await expect(
        merkleRewardSystem.connect(user1Wallet).claimRewards(
          campaignIds,
          amounts,
          proofs
        )
      ).to.emit(merkleRewardSystem, "RewardsClaimed");

      // Verify claimed amounts
      for (let i = 0; i < campaignIds.length; i++) {
        const claimedAmount = await merkleRewardSystem.userClaims(campaignIds[i], user1Wallet.address);
        expect(claimedAmount).to.equal(amounts[i]);
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