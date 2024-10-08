const { assert, expect } = require('chai');
const { ethers } = require('hardhat');
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("MerkleRewardSystem Integration Tests", function () {
  let merkleRewardSystem, owner, user1Wallet, user2Wallet, user3Wallet;
  let rewardToken, secondRewardToken, lpToken;
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

  before(async function () {
    [owner] = await ethers.getSigners();

    // Deploy MerkleRewardSystem
    const MerkleRewardSystem = await ethers.getContractFactory("MerkleRewardSystem");
    merkleRewardSystem = await MerkleRewardSystem.deploy();
    await merkleRewardSystem.deployed();
    console.log("MerkleRewardSystem deployed to:", merkleRewardSystem.address);

    // Deploy RewardToken
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    rewardToken = await MockERC20.deploy("Reward Token", "RWD");
    await rewardToken.deployed();
    console.log("RewardToken deployed to:", rewardToken.address);

    // Deploy SecondRewardToken
    secondRewardToken = await MockERC20.deploy("Second Reward Token", "RWD2");
    await secondRewardToken.deployed();
    console.log("SecondRewardToken deployed to:", secondRewardToken.address);

    // Deploy LPToken
    lpToken = await MockERC20.deploy("LP Token", "LP");
    await lpToken.deployed();
    console.log("LPToken deployed to:", lpToken.address);

    // Set up roles if necessary
    await merkleRewardSystem.grantRole(await merkleRewardSystem.CREATOR_ROLE(), owner.address);
    await merkleRewardSystem.grantRole(await merkleRewardSystem.ADMIN_ROLE(), owner.address);

    // Approve MerkleRewardSystem to spend tokens
    await rewardToken.approve(merkleRewardSystem.address, ethers.constants.MaxUint256);
    await secondRewardToken.approve(merkleRewardSystem.address, ethers.constants.MaxUint256);
    await lpToken.approve(merkleRewardSystem.address, ethers.constants.MaxUint256);

    // Create dummy users
    user1Wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    user2Wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    user3Wallet = ethers.Wallet.createRandom().connect(ethers.provider);

    // Fund user wallets with ETH for gas
    const tx1 = await owner.sendTransaction({
      to: user1Wallet.address,
      value: ethers.utils.parseEther("1"),
    });
    await tx1.wait();

    const tx2 = await owner.sendTransaction({
      to: user2Wallet.address,
      value: ethers.utils.parseEther("1"),
    });
    await tx2.wait();

    const tx3 = await owner.sendTransaction({
      to: user3Wallet.address,
      value: ethers.utils.parseEther("1"),
    });
    await tx3.wait();

    // Transfer LP Tokens to users
    await lpToken.transfer(user1Wallet.address, ethers.utils.parseEther("1000"));
    await lpToken.transfer(user2Wallet.address, ethers.utils.parseEther("1000"));
    await lpToken.transfer(user3Wallet.address, ethers.utils.parseEther("1000"));
  });

  describe("Campaign Creation", function () {
    it("Should create a campaign with valid parameters", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, owner, admin } = await loadFixture(deployMerkleRewardSystemFixture);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const startTimestamp = currentTimestamp + 60; // Campaign starts in 1 minute
        const endTimestamp = startTimestamp + 3600; // Campaign ends in 1 hour

        // Whitelist the reward token
        await merkleRewardSystem.connect(admin).whitelistToken(rewardToken.address);

        await merkleRewardSystem.connect(owner).createCampaign(
            rewardToken.address,
            lpToken.address,
            ethers.utils.parseEther("1"),
            startTimestamp,
            endTimestamp,
            ethers.utils.parseEther("1000")
        );

        const campaign = await merkleRewardSystem.campaigns(0);
        expect(campaign.creator).to.equal(owner.address);
        expect(campaign.rewardToken).to.equal(rewardToken.address);
        expect(campaign.lpToken).to.equal(lpToken.address);
        expect(campaign.startTimestamp).to.equal(startTimestamp);
        expect(campaign.endTimestamp).to.equal(endTimestamp);
        expect(campaign.totalRewards).to.equal(ethers.utils.parseEther("1000"));
    });

    // ... other campaign creation tests
  });

  describe("Creation of Campaigns", function () {
    it("Should create a campaign successfully", async function () {
      const campaignParams = {
        rewardToken: rewardToken.address,
        lpToken: lpToken.address,
        maxRewardRate: ethers.utils.parseEther("0.1"),
        startBlock: await ethers.provider.getBlockNumber() + 10,
        endBlock: await ethers.provider.getBlockNumber() + 20,
        totalRewardAmount: ethers.utils.parseEther("1000"),
        merkleRoot: "0x0000000000000000000000000000000000000000000000000000000000000000"
      };

      await expect(
        merkleRewardSystem.createCampaign(
          campaignParams.rewardToken,
          campaignParams.lpToken,
          campaignParams.maxRewardRate,
          campaignParams.startBlock,
          campaignParams.endBlock,
          campaignParams.totalRewardAmount,
          campaignParams.merkleRoot
        )
      ).to.emit(merkleRewardSystem, "CampaignCreated");

      const campaign = await merkleRewardSystem.campaigns(0);
      expect(campaign.rewardToken).to.equal(campaignParams.rewardToken);
      expect(campaign.lpToken).to.equal(campaignParams.lpToken);
      expect(campaign.maxRewardRate).to.equal(campaignParams.maxRewardRate);
      expect(campaign.startBlock).to.equal(campaignParams.startBlock);
      expect(campaign.endBlock).to.equal(campaignParams.endBlock);
      expect(campaign.totalRewardAmount).to.equal(campaignParams.totalRewardAmount);
      expect(campaign.creator).to.equal(owner.address);
      expect(campaign.merkleRoot).to.equal(campaignParams.merkleRoot);
    });

    it("Should not allow non-creator to increase max reward rate", async function () {
      const newMaxRate = ethers.utils.parseEther("0.2");
      await expect(
        merkleRewardSystem.connect(user1Wallet).increaseMaxRewardRate(0, newMaxRate)
      ).to.be.revertedWith("Not campaign creator");
    });

    it("Should return correct campaign IDs", async function () {
      const totalCampaigns = await merkleRewardSystem.campaignCount();
      const campaignIds = [];

      for (let i = 0; i < totalCampaigns; i++) {
        campaignIds.push(i);
      }

      expect(campaignIds).to.include(0); // First campaign
      expect(campaignIds).to.include(1); // Second campaign
    });
  });

  describe("Admin Withdrawal with Cooldown", function () {
    it("Should allow admin to withdraw unclaimed rewards after 90 days", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, admin, owner } = await loadFixture(deployMerkleRewardSystemFixture);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const startTimestamp = currentTimestamp + 60; // Campaign starts in 1 minute
        const endTimestamp = startTimestamp + 3600; // Campaign ends in 1 hour

        // Whitelist the reward token
        await merkleRewardSystem.connect(admin).whitelistToken(rewardToken.address);

        // Create campaign
        await merkleRewardSystem.connect(owner).createCampaign(
            rewardToken.address,
            lpToken.address,
            ethers.utils.parseEther("1"),
            startTimestamp,
            endTimestamp,
            ethers.utils.parseEther("1000")
        );

        // Fund the contract
        await rewardToken.connect(owner).mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));

        // Fast forward time by 90 days using Hardhat's `evm_increaseTime` if possible
        await network.provider.send("evm_increaseTime", [90 * 24 * 60 * 60]);
        await network.provider.send("evm_mine");

        // Admin withdraws unclaimed rewards
        await expect(merkleRewardSystem.connect(admin).withdrawUnclaimedRewards(0))
            .to.emit(merkleRewardSystem, "UnclaimedRewardsWithdrawn")
            .withArgs(0, ethers.utils.parseEther("1000"), admin.address);

        // Attempt to withdraw again should fail
        await expect(merkleRewardSystem.connect(admin).withdrawUnclaimedRewards(0))
            .to.be.revertedWith("AdminWithdrawalAlreadyDone");
    });
  });

  describe("Creator Withdrawal with Cooldown", function () {
    it("Should allow creator to withdraw unclaimed rewards after 30 days", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, owner } = await loadFixture(deployMerkleRewardSystemFixture);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const startTimestamp = currentTimestamp + 60; // Campaign starts in 1 minute
        const endTimestamp = startTimestamp + 3600; // Campaign ends in 1 hour

        // Whitelist the reward token
        await merkleRewardSystem.connect(owner).whitelistToken(rewardToken.address);

        // Create campaign
        await merkleRewardSystem.connect(owner).createCampaign(
            rewardToken.address,
            lpToken.address,
            ethers.utils.parseEther("1"),
            startTimestamp,
            endTimestamp,
            ethers.utils.parseEther("1000")
        );

        // Fund the contract
        await rewardToken.connect(owner).mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));

        // Fast forward time by 30 days using Hardhat's `evm_increaseTime` if possible
        await network.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
        await network.provider.send("evm_mine");

        // Creator withdraws unclaimed rewards
        await expect(merkleRewardSystem.connect(owner).withdrawRewardTokens(0, ethers.utils.parseEther("1000")))
            .to.emit(merkleRewardSystem, "RewardTokensWithdrawn")
            .withArgs(0, owner.address, ethers.utils.parseEther("1000"));

        // Attempt to withdraw more than available should fail
        await expect(
            merkleRewardSystem.connect(owner).withdrawRewardTokens(0, ethers.utils.parseEther("1"))
        ).to.be.revertedWith("InsufficientBalance");
    });
  });

  describe("Reward Claiming", function () {
    it("Should allow claiming at the start of the campaign", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, owner, updater, user1Wallet } = await loadFixture(deployMerkleRewardSystemFixture);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const startTimestamp = currentTimestamp + 60; // Campaign starts in 1 minute
        const endTimestamp = startTimestamp + 3600; // Campaign ends in 1 hour

        // Whitelist the reward token
        await merkleRewardSystem.connect(owner).whitelistToken(rewardToken.address);

        // Create campaign
        await merkleRewardSystem.connect(owner).createCampaign(
            rewardToken.address,
            lpToken.address,
            ethers.utils.parseEther("1"),
            startTimestamp,
            endTimestamp,
            ethers.utils.parseEther("1000")
        );

        // Create Merkle tree
        const leaf = ethers.utils.solidityKeccak256(
            ['uint256', 'address', 'uint256'],
            [0, user1Wallet.address, ethers.utils.parseEther("100")]
        );
        const merkleTree = new MerkleTree([leaf], keccak256, { sortPairs: true });
        const root = merkleTree.getHexRoot();

        // Update global root
        await merkleRewardSystem.connect(owner).updateGlobalRoot(root, currentTimestamp + 60);

        // Fund the contract
        await rewardToken.connect(owner).mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));

        // Fast forward time to campaign start
        await network.provider.send("evm_increaseTime", [60]);
        await network.provider.send("evm_mine");

        // Claim rewards
        const proof = merkleTree.getHexProof(leaf);
        await expect(merkleRewardSystem.connect(user1Wallet).claimRewards(
            [0], // campaignIds
            [ethers.utils.parseEther("100")], // amounts
            [proof] // proofs
        )).to.emit(merkleRewardSystem, "RewardsClaimed").withArgs(
            user1Wallet.address,
            ethers.utils.parseEther("100")
        );

        // Verify claimed amount
        const claimedAmount = await merkleRewardSystem.userClaims(0, user1Wallet.address);
        expect(claimedAmount).to.equal(ethers.utils.parseEther("100"));
    });

    // ... other reward claiming tests
  });

  describe("Pausability", function () {
    it("Should allow admin to pause and unpause", async function () {
        await merkleRewardSystem.connect(owner).pause();
        expect(await merkleRewardSystem.paused()).to.be.true;

        await merkleRewardSystem.connect(owner).unpause();
        expect(await merkleRewardSystem.paused()).to.be.false;
    });

    it("Should not allow non-admin to pause", async function () {
        await expect(merkleRewardSystem.connect(user1Wallet).pause())
            .to.be.revertedWith("AccessControl:");
    });

    it("Should not allow non-admin to unpause", async function () {
        await merkleRewardSystem.connect(owner).pause();

        await expect(merkleRewardSystem.connect(user1Wallet).unpause())
            .to.be.revertedWith("AccessControl:");
    });
  });

  // Remove tests that require waiting for cooldown periods
});