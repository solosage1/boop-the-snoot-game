const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("BoopTheSnoot Merkle Tests", function () {
  let boopTheSnoot, rewardToken, lpToken, owner, admin, updater;
  let user1Wallet, user2Wallet, user3Wallet;

  const ADMIN_COOLDOWN_PERIOD = 90 * 24 * 60 * 60; // 90 days
  const CREATOR_COOLDOWN_PERIOD = 30 * 24 * 60 * 60; // 30 days

  async function deployBoopTheSnootFixture() {
    const [ownerSigner, adminSigner, updaterSigner] = await ethers.getSigners();
    owner = ownerSigner;
    admin = adminSigner;
    updater = updaterSigner;

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    rewardToken = await MockERC20.deploy("Reward Token", "RWD");
    await rewardToken.deployed();

    lpToken = await MockERC20.deploy("LP Token", "LP");
    await lpToken.deployed();

    const BoopTheSnootFactory = await ethers.getContractFactory("BoopTheSnoot", owner);
    boopTheSnoot = BoopTheSnootFactory.attach(DEPLOYED_CONTRACT_ADDRESS);

    await boopTheSnoot.grantRole(await boopTheSnoot.ADMIN_ROLE(), admin.address);
    await boopTheSnoot.grantRole(await boopTheSnoot.UPDATER_ROLE(), updater.address);

    user1Wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    user2Wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    user3Wallet = ethers.Wallet.createRandom().connect(ethers.provider);

    await owner.sendTransaction({ to: user1Wallet.address, value: ethers.utils.parseEther("1") });
    await owner.sendTransaction({ to: user2Wallet.address, value: ethers.utils.parseEther("1") });
    await owner.sendTransaction({ to: user3Wallet.address, value: ethers.utils.parseEther("1") });

    const mintAmount = ethers.utils.parseEther("1000000");
    await rewardToken.mint(owner.address, mintAmount);
    await lpToken.mint(owner.address, mintAmount);

    await rewardToken.connect(owner).approve(boopTheSnoot.address, mintAmount);
    await lpToken.connect(owner).approve(boopTheSnoot.address, mintAmount);

    await boopTheSnoot.connect(admin).whitelistToken(rewardToken.address);
    await boopTheSnoot.connect(admin).whitelistToken(lpToken.address);
  }

  beforeEach(async function () {
    await loadFixture(deployBoopTheSnootFixture);
  });

  describe("Campaign Creation", function () {
    it("Should create a campaign with valid parameters", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      await boopTheSnoot.connect(owner).createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        startTimestamp,
        endTimestamp,
        ethers.utils.parseEther("1000")
      );

      const campaign = await boopTheSnoot.campaigns(0);
      expect(campaign.creator).to.equal(owner.address);
      expect(campaign.rewardToken).to.equal(rewardToken.address);
      expect(campaign.lpToken).to.equal(lpToken.address);
      expect(campaign.startTimestamp).to.equal(startTimestamp);
      expect(campaign.endTimestamp).to.equal(endTimestamp);
      expect(campaign.totalRewards).to.equal(ethers.utils.parseEther("1000"));
    });
  });

  describe("Admin Withdrawal with Cooldown", function () {
    it("Should allow admin to withdraw unclaimed rewards after cooldown period", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      await boopTheSnoot.connect(owner).createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        startTimestamp,
        endTimestamp,
        ethers.utils.parseEther("1000")
      );

      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      await network.provider.send("evm_increaseTime", [endTimestamp - currentTimestamp + 1]);
      await network.provider.send("evm_mine");

      await network.provider.send("evm_increaseTime", [ADMIN_COOLDOWN_PERIOD]);
      await network.provider.send("evm_mine");

      await expect(boopTheSnoot.connect(admin).withdrawUnclaimedRewards(0))
        .to.emit(boopTheSnoot, "UnclaimedRewardsWithdrawn")
        .withArgs(0, ethers.utils.parseEther("1000"), admin.address);
    });
  });

  describe("Creator Withdrawal with Cooldown", function () {
    it("Should allow creator to withdraw unclaimed rewards after cooldown period", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      await boopTheSnoot.connect(owner).createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        startTimestamp,
        endTimestamp,
        ethers.utils.parseEther("1000")
      );

      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      await network.provider.send("evm_increaseTime", [endTimestamp - currentTimestamp + 1]);
      await network.provider.send("evm_mine");

      await network.provider.send("evm_increaseTime", [CREATOR_COOLDOWN_PERIOD]);
      await network.provider.send("evm_mine");

      await expect(boopTheSnoot.connect(owner).withdrawRewardTokens(0, ethers.utils.parseEther("1000")))
        .to.emit(boopTheSnoot, "RewardTokensWithdrawn");
    });
  });

  describe("Reward Claiming", function () {
    it("Should allow claiming at the start of the campaign", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      await boopTheSnoot.connect(owner).createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        startTimestamp,
        endTimestamp,
        ethers.utils.parseEther("1000")
      );

      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");

      const campaignId = 0;
      const amount = ethers.utils.parseEther("100");

      const leaf = ethers.utils.solidityKeccak256(
        ['uint256', 'address', 'uint256'],
        [campaignId, user1Wallet.address, amount]
      );

      const merkleTree = new MerkleTree([leaf], keccak256, { sortPairs: true });
      const root = merkleTree.getHexRoot();
      const proof = merkleTree.getHexProof(leaf);

      await boopTheSnoot.connect(updater).updateGlobalRoot(
        root,
        (await ethers.provider.getBlock('latest')).timestamp
      );

      await expect(boopTheSnoot.connect(user1Wallet).claimRewards(
        [campaignId],
        [amount],
        [proof]
      )).to.emit(boopTheSnoot, "RewardsClaimed")
        .withArgs(user1Wallet.address, amount);

      const claimedAmount = await boopTheSnoot.getUserClaimedAmount(campaignId, user1Wallet.address);
      expect(claimedAmount).to.equal(amount);
    });
  });

  describe("Reward Token Withdrawal", function () {
    it("Should allow creator to withdraw unclaimed rewards after campaign end", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      await boopTheSnoot.connect(owner).createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        startTimestamp,
        endTimestamp,
        ethers.utils.parseEther("1000")
      );

      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      await network.provider.send("evm_increaseTime", [endTimestamp - currentTimestamp + 1]);
      await network.provider.send("evm_mine");

      await network.provider.send("evm_increaseTime", [CREATOR_COOLDOWN_PERIOD]);
      await network.provider.send("evm_mine");

      const contractBalanceBefore = await rewardToken.balanceOf(boopTheSnoot.address);

      await expect(boopTheSnoot.connect(owner).withdrawRewardTokens(0, ethers.utils.parseEther("1000")))
        .to.emit(boopTheSnoot, "RewardTokensWithdrawn");

      const contractBalanceAfter = await rewardToken.balanceOf(boopTheSnoot.address);

      expect(contractBalanceBefore.sub(contractBalanceAfter)).to.equal(ethers.utils.parseEther("1000"));
    });
  });

  describe("Pausability", function () {
    it("Should allow admin to pause and unpause", async function () {
      await boopTheSnoot.connect(admin).pause();
      expect(await boopTheSnoot.paused()).to.be.true;

      await boopTheSnoot.connect(admin).unpause();
      expect(await boopTheSnoot.paused()).to.be.false;
    });

    it("Should not allow non-admin to pause", async function () {
      await expect(boopTheSnoot.connect(user1Wallet).pause()).to.be.revertedWith(
        `AccessControl: account ${user1Wallet.address.toLowerCase()} is missing role ${await boopTheSnoot.ADMIN_ROLE()}`
      );
    });

    it("Should not allow non-admin to unpause", async function () {
      await boopTheSnoot.connect(admin).pause();
      await expect(boopTheSnoot.connect(user1Wallet).unpause()).to.be.revertedWith(
        `AccessControl: account ${user1Wallet.address.toLowerCase()} is missing role ${await boopTheSnoot.ADMIN_ROLE()}`
      );
    });

    it("Should prevent actions when paused", async function () {
      await boopTheSnoot.connect(admin).pause();

      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      await expect(boopTheSnoot.connect(owner).createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        startTimestamp,
        endTimestamp,
        ethers.utils.parseEther("1000")
      )).to.be.revertedWith("Pausable: paused");
    });
  });
});