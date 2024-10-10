const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

// Import the Chai matchers
require("@nomicfoundation/hardhat-chai-matchers");

describe("MerkleRewardSystem Advanced Tests", function () {
  let boopTheSnoot;
  let rewardToken;
  let lpToken;
  let owner;
  let admin;
  let updater;
  let user1;
  let user2;
  let user3;

  beforeEach(async function () {
    [owner, admin, updater, user1, user2, user3] = await ethers.getSigners();

    // Deploy BoopTheSnoot contract
    const BoopTheSnootFactory = await ethers.getContractFactory("BoopTheSnoot");
    boopTheSnoot = await BoopTheSnootFactory.deploy();
    await boopTheSnoot.deployed();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    rewardToken = await MockERC20.deploy("Reward Token", "RWD");
    lpToken = await MockERC20.deploy("LP Token", "LP");
    await rewardToken.deployed();
    await lpToken.deployed();

    // Mint reward tokens to the owner
    await rewardToken.mint(owner.address, ethers.utils.parseEther("1000000"));
    await rewardToken.mint(admin.address, ethers.utils.parseEther("1000000"));
    await rewardToken.mint(updater.address, ethers.utils.parseEther("1000000"));
    await rewardToken.mint(user1.address, ethers.utils.parseEther("1000"));
    await rewardToken.mint(user2.address, ethers.utils.parseEther("1000"));
    await rewardToken.mint(user3.address, ethers.utils.parseEther("1000"));

    // Approve reward tokens to the BoopTheSnoot contract
    await rewardToken.connect(owner).approve(boopTheSnoot.address, ethers.utils.parseEther("1000000"));
    await rewardToken.connect(admin).approve(boopTheSnoot.address, ethers.utils.parseEther("1000000"));
    await rewardToken.connect(updater).approve(boopTheSnoot.address, ethers.utils.parseEther("1000000"));
    await rewardToken.connect(user1).approve(boopTheSnoot.address, ethers.utils.parseEther("1000"));
    await rewardToken.connect(user2).approve(boopTheSnoot.address, ethers.utils.parseEther("1000"));
    await rewardToken.connect(user3).approve(boopTheSnoot.address, ethers.utils.parseEther("1000"));

    // Assign additional roles if necessary
    await boopTheSnoot.connect(owner).grantRole(await boopTheSnoot.ADMIN_ROLE(), admin.address);
    await boopTheSnoot.connect(owner).grantRole(await boopTheSnoot.UPDATER_ROLE(), updater.address);

    // Whitelist the reward token and LP token
    await boopTheSnoot.connect(admin).whitelistToken(rewardToken.address);
    await boopTheSnoot.connect(admin).whitelistToken(lpToken.address);

    // Create a campaign
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

    // Transfer some LP tokens to user1 for referrals
    await lpToken.mint(user1.address, ethers.utils.parseEther("100"));
    await lpToken.connect(user1).approve(boopTheSnoot.address, ethers.utils.parseEther("100"));
  });

  describe("Merkle Root Updates", function () {
    it("Should allow the updater to update global Merkle root", async function () {
      const newRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("new merkle root"));

      await boopTheSnoot.connect(updater).updateGlobalRoot(newRoot);

      const updatedRoot = await boopTheSnoot.globalMerkleRoot();
      expect(updatedRoot).to.equal(newRoot);
    });

    it("Should prevent non-updaters from updating Merkle roots", async function () {
      const newRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("new merkle root"));

      await expect(
        boopTheSnoot.connect(user1).updateGlobalRoot(newRoot)
      ).to.be.revertedWith("AccessControl:");
    });
  });

  describe("Campaign Creation Edge Cases", function () {
    it("Should fail to create a campaign with end time before start time", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 3600; // Starts in 1 hour
      const endTimestamp = startTimestamp - 60; // Ends 1 minute before start

      await expect(
        boopTheSnoot.connect(owner).createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          startTimestamp,
          endTimestamp,
          ethers.utils.parseEther("2000")
        )
      ).to.be.revertedWith("InvalidCampaignDuration()");
    });

    it("Should prevent creating a campaign with non-whitelisted tokens", async function () {
      const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
      const startTimestamp = currentTimestamp + 60;
      const endTimestamp = startTimestamp + 3600;

      const nonWhitelistedToken = await ethers.getContractFactory("MockERC20");
      const fakeToken = await nonWhitelistedToken.deploy("Fake Token", "FAKE");
      await fakeToken.deployed();

      await expect(
        boopTheSnoot.connect(owner).createCampaign(
          fakeToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          startTimestamp,
          endTimestamp,
          ethers.utils.parseEther("1000")
        )
      ).to.be.revertedWith("InvalidRewardToken()");
    });
  });

  describe("Withdrawal Restrictions", function () {
    it("Should prevent withdrawal before cooldown periods", async function () {
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

      const campaignId = await boopTheSnoot.campaignCount();
      const campaignIndex = campaignId.sub(1);

      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      // Fast forward time to just after campaign end but before cooldown
      const cooldownTime = await boopTheSnoot.ADMIN_WITHDRAW_COOLDOWN();
      await network.provider.send("evm_increaseTime", [endTimestamp - currentTimestamp + cooldownTime.toNumber() - 10]);
      await network.provider.send("evm_mine");

      // Attempt to withdraw before cooldown
      await expect(
        boopTheSnoot.connect(admin).adminWithdrawUnclaimedRewards(campaignIndex)
      ).to.be.revertedWith("CooldownPeriodNotPassed()");
    });
  });

  describe("Complex Reward Claiming", function () {
    it("Should fail to claim with invalid proofs", async function () {
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

      const campaignId = (await boopTheSnoot.campaignCount()).sub(1);

      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      const amount = ethers.utils.parseEther("100");
      const leaf = ethers.utils.solidityKeccak256(
        ['uint256', 'address', 'uint256', 'string'],
        [campaignId, user1.address, amount, 'game']
      );
      const tree = new MerkleTree([leaf], keccak256, { sortPairs: true });
      const root = tree.getHexRoot();
      const proof = tree.getHexProof(leaf);

      await boopTheSnoot.connect(updater).updateGlobalRoot(root);

      // Fast forward time to campaign start
      await network.provider.send("evm_increaseTime", [70]);
      await network.provider.send("evm_mine");

      // Attempt to claim with invalid proof
      const invalidProof = [];
      const rewardClaim = {
        campaignId: campaignId,
        user: user1.address,
        amount: amount,
        rewardType: 0 // RewardType.Game
      };

      await expect(
        boopTheSnoot.connect(user1).claimRewards(
          [rewardClaim],
          [invalidProof]
        )
      ).to.be.revertedWithCustomError(boopTheSnoot, "InvalidProof");
    });

    it("Should fail to claim with invalid cumulative amount", async function () {
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

      const campaignId = (await boopTheSnoot.campaignCount()).sub(1);

      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      const amount = ethers.utils.parseEther("100");
      const leaf = ethers.utils.solidityKeccak256(
        ['uint256', 'address', 'uint256', 'string'],
        [campaignId, user1.address, amount, 'game']
      );
      const tree = new MerkleTree([leaf], keccak256, { sortPairs: true });
      const root = tree.getHexRoot();
      const proof = tree.getHexProof(leaf);

      await boopTheSnoot.connect(updater).updateGlobalRoot(root);

      // Fast forward time to campaign start
      await network.provider.send("evm_increaseTime", [70]);
      await network.provider.send("evm_mine");

      // Create a claim with an amount higher than what's in the Merkle tree
      const invalidRewardClaim = {
        campaignId: campaignId,
        user: user1.address,
        amount: amount.add(ethers.utils.parseEther("1")),
        rewardType: 0 // RewardType.Game
      };

      await expect(
        boopTheSnoot.connect(user1).claimRewards(
          [invalidRewardClaim],
          [proof]
        )
      ).to.be.revertedWith("InvalidCumulativeAmount");
    });

    it("Should allow successful reward claim with valid proof", async function () {
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

      const campaignId = (await boopTheSnoot.campaignCount()).sub(1);

      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      const amount = ethers.utils.parseEther("100");
      const leaf = ethers.utils.solidityKeccak256(
        ['uint256', 'address', 'uint256', 'string'],
        [campaignId, user1.address, amount, 'game']
      );
      const tree = new MerkleTree([leaf], keccak256, { sortPairs: true });
      const root = tree.getHexRoot();
      const proof = tree.getHexProof(leaf);

      await boopTheSnoot.connect(updater).updateGlobalRoot(root);

      // Fast forward time to campaign start
      await network.provider.send("evm_increaseTime", [70]);
      await network.provider.send("evm_mine");

      const rewardClaim = {
        campaignId: campaignId,
        user: user1.address,
        amount: amount,
        rewardType: 0 // RewardType.Game
      };

      const initialBalance = await rewardToken.balanceOf(user1.address);

      await expect(
        boopTheSnoot.connect(user1).claimRewards(
          [rewardClaim],
          [proof]
        )
      ).to.emit(boopTheSnoot, 'RewardsClaimed').withArgs(user1.address, campaignId, amount);

      const finalBalance = await rewardToken.balanceOf(user1.address);
      expect(finalBalance).to.equal(initialBalance.add(amount));
    });
  });

  describe("Withdrawal Functions", function () {
    it("Should allow admin to withdraw unclaimed rewards after cooldown", async function () {
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

      const campaignId = (await boopTheSnoot.campaignCount()).sub(1);

      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      // Fast forward time to after campaign end and cooldown period
      const cooldownTime = await boopTheSnoot.ADMIN_WITHDRAW_COOLDOWN();
      await network.provider.send("evm_increaseTime", [endTimestamp - currentTimestamp + cooldownTime.toNumber() + 10]);
      await network.provider.send("evm_mine");

      await expect(
        boopTheSnoot.connect(admin).adminWithdrawUnclaimedRewards(campaignId)
      ).to.emit(boopTheSnoot, 'UnclaimedRewardsWithdrawn').withArgs(campaignId, ethers.utils.parseEther("1000"), admin.address);

      const adminBalance = await rewardToken.balanceOf(admin.address);
      expect(adminBalance).to.equal(ethers.utils.parseEther("1000000").add(ethers.utils.parseEther("1000")));
    });

    it("Should prevent admin from withdrawing twice", async function () {
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

      const campaignId = (await boopTheSnoot.campaignCount()).sub(1);

      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      // Fast forward time to after campaign end and cooldown period
      const cooldownTime = await boopTheSnoot.ADMIN_WITHDRAW_COOLDOWN();
      await network.provider.send("evm_increaseTime", [endTimestamp - currentTimestamp + cooldownTime.toNumber() + 10]);
      await network.provider.send("evm_mine");

      // First withdrawal
      await boopTheSnoot.connect(admin).adminWithdrawUnclaimedRewards(campaignId);

      // Attempt second withdrawal
      await expect(
        boopTheSnoot.connect(admin).adminWithdrawUnclaimedRewards(campaignId)
      ).to.be.revertedWith("AdminWithdrawalAlreadyDone()");
    });
  });

  describe("Referral Program Integration", function () {
    it("Should allow users to make referrals successfully", async function () {
      const lpAmount = ethers.utils.parseEther("10");
      await lpToken.mint(user1.address, lpAmount);
      await lpToken.connect(user1).approve(boopTheSnoot.address, lpAmount);

      await expect(
        boopTheSnoot.connect(user1).makeReferral([user2.address], [lpAmount])
      ).to.emit(boopTheSnoot, 'ReferralMade').withArgs(user1.address, user2.address, lpAmount);

      expect(await boopTheSnoot.referrerOf(user2.address)).to.equal(user1.address);
      const referees = await boopTheSnoot.referees(user1.address);
      expect(referees.length).to.equal(1);
      expect(referees[0]).to.equal(user2.address);
    });

    it("Should prevent self-referral", async function () {
      await lpToken.mint(user1.address, ethers.utils.parseEther("10"));
      await lpToken.connect(user1).approve(boopTheSnoot.address, ethers.utils.parseEther("10"));

      await expect(
        boopTheSnoot.connect(user1).makeReferral([user1.address], [ethers.utils.parseEther("10")])
      ).to.be.revertedWith("SelfReferralNotAllowed");
    });

    it("Should prevent referring an already referred user", async function () {
      await lpToken.mint(user1.address, ethers.utils.parseEther("20"));
      await lpToken.connect(user1).approve(boopTheSnoot.address, ethers.utils.parseEther("20"));
      await boopTheSnoot.connect(user1).makeReferral([user2.address], [ethers.utils.parseEther("10")]);

      await expect(
        boopTheSnoot.connect(user1).makeReferral([user2.address], [ethers.utils.parseEther("10")])
      ).to.be.revertedWith("UserAlreadyReferred");
    });

    it("Should allow users to claim referral rewards with valid proof", async function () {
      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      // User1 refers User2
      await boopTheSnoot.connect(user1).makeReferral([user2.address], [ethers.utils.parseEther("10")]);

      // Assume Off-Chain system processes ReferralMade events and allocates referral rewards
      // For testing, we'll manually create a Merkle tree with User1's referral reward

      const referralAmount = ethers.utils.parseEther("50");
      const leaf = ethers.utils.solidityKeccak256(
        ['address', 'uint256', 'string'],
        [user1.address, referralAmount, 'referral']
      );
      const tree = new MerkleTree([leaf], keccak256, { sortPairs: true });
      const root = tree.getHexRoot();
      const proof = tree.getHexProof(leaf);

      // Update the global Merkle root
      await boopTheSnoot.connect(updater).updateGlobalRoot(root);

      // User1 claims referral reward
      const rewardClaim = {
        campaignId: 0, // 0 indicates referral reward
        user: user1.address,
        amount: referralAmount,
        rewardType: 1 // RewardType.Referral
      };

      await expect(
        boopTheSnoot.connect(user1).claimRewards(
          [rewardClaim],
          [proof]
        )
      ).to.emit(boopTheSnoot, 'RewardsClaimed').withArgs(user1.address, 0, referralAmount);

      const userBalance = await rewardToken.balanceOf(user1.address);
      expect(userBalance).to.equal(ethers.utils.parseEther("1000").add(referralAmount));
    });

    it("Should prevent users from claiming referral rewards more than once", async function () {
      await rewardToken.connect(owner).transfer(boopTheSnoot.address, ethers.utils.parseEther("1000"));

      // User1 refers User2
      await boopTheSnoot.connect(user1).makeReferral([user2.address], [ethers.utils.parseEther("10")]);

      // Create Merkle tree for referral reward
      const referralAmount = ethers.utils.parseEther("50");
      const leaf = ethers.utils.solidityKeccak256(
        ['address', 'uint256', 'string'],
        [user1.address, referralAmount, 'referral']
      );
      const tree = new MerkleTree([leaf], keccak256, { sortPairs: true });
      const root = tree.getHexRoot();
      const proof = tree.getHexProof(leaf);

      // Update the global Merkle root
      await boopTheSnoot.connect(updater).updateGlobalRoot(root);

      // User1 claims referral reward
      const rewardClaim = {
        campaignId: 0, // 0 indicates referral reward
        user: user1.address,
        amount: referralAmount,
        rewardType: 1 // RewardType.Referral
      };

      await boopTheSnoot.connect(user1).claimRewards(
        [rewardClaim],
        [proof]
      );

      // Attempt to claim again
      await expect(
        boopTheSnoot.connect(user1).claimRewards(
          [rewardClaim],
          [proof]
        )
      ).to.be.revertedWithCustomError(boopTheSnoot, "ExceedsEntitlement");
    });
  });
});