const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

describe("MerkleRewardSystem", function () {
  async function deployMerkleRewardSystemFixture() {
    const [owner, admin, updater, user1, user2, user3] = await ethers.getSigners();

    const MerkleRewardSystem = await ethers.getContractFactory("MerkleRewardSystem");
    const merkleRewardSystem = await MerkleRewardSystem.deploy();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const rewardToken = await MockERC20.deploy("Reward Token", "RWD");
    const lpToken = await MockERC20.deploy("LP Token", "LP");

    // Grant roles
    const ADMIN_ROLE = await merkleRewardSystem.ADMIN_ROLE();
    const UPDATER_ROLE = await merkleRewardSystem.UPDATER_ROLE();
    await merkleRewardSystem.grantRole(ADMIN_ROLE, admin.address);
    await merkleRewardSystem.grantRole(UPDATER_ROLE, updater.address);

    // Whitelist reward token
    await merkleRewardSystem.connect(admin).whitelistToken(rewardToken.address);

    return { merkleRewardSystem, rewardToken, lpToken, owner, admin, updater, user1, user2, user3 };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { merkleRewardSystem, owner } = await loadFixture(deployMerkleRewardSystemFixture);
      const DEFAULT_ADMIN_ROLE = await merkleRewardSystem.DEFAULT_ADMIN_ROLE();
      expect(await merkleRewardSystem.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });
  });

  describe("Token Whitelisting", function () {
    it("Should allow admin to whitelist a token", async function () {
      const { merkleRewardSystem, admin, lpToken } = await loadFixture(deployMerkleRewardSystemFixture);
      await merkleRewardSystem.connect(admin).whitelistToken(lpToken.address);
      expect(await merkleRewardSystem.whitelistedTokens(lpToken.address)).to.be.true;
    });

    it("Should not allow non-admin to whitelist a token", async function () {
      const { merkleRewardSystem, user1, lpToken } = await loadFixture(deployMerkleRewardSystemFixture);
      await expect(merkleRewardSystem.connect(user1).whitelistToken(lpToken.address))
        .to.be.revertedWith("AccessControl:");
    });

    it("Should allow admin to remove a whitelisted token", async function () {
      const { merkleRewardSystem, admin, rewardToken } = await loadFixture(deployMerkleRewardSystemFixture);
      await merkleRewardSystem.connect(admin).removeWhitelistedToken(rewardToken.address);
      expect(await merkleRewardSystem.whitelistedTokens(rewardToken.address)).to.be.false;
    });
  });

  describe("Campaign Creation", function () {
    it("Should create a campaign with valid parameters", async function () {
      const { merkleRewardSystem, rewardToken, lpToken, owner } = await loadFixture(deployMerkleRewardSystemFixture);
      const blockNumber = await ethers.provider.getBlockNumber();
      await merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        blockNumber + 100,
        blockNumber + 1000
      );
      const campaign = await merkleRewardSystem.campaigns(0);
      expect(campaign.creator).to.equal(owner.address);
      expect(campaign.rewardToken).to.equal(rewardToken.address);
      expect(campaign.lpToken).to.equal(lpToken.address);
    });

    it("Should not create a campaign with non-whitelisted reward token", async function () {
      const { merkleRewardSystem, lpToken, owner } = await loadFixture(deployMerkleRewardSystemFixture);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(merkleRewardSystem.createCampaign(
        owner.address, // Using owner address as non-whitelisted token
        lpToken.address,
        ethers.utils.parseEther("1"),
        blockNumber + 100,
        blockNumber + 1000
      )).to.be.revertedWith("InvalidRewardToken");
    });

    it("Should not create a campaign with invalid duration", async function () {
      const { merkleRewardSystem, rewardToken, lpToken } = await loadFixture(deployMerkleRewardSystemFixture);
      const blockNumber = await ethers.provider.getBlockNumber();
      await expect(merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        blockNumber + 100,
        blockNumber + 100 // Same as start block
      )).to.be.revertedWith("InvalidCampaignDuration");
    });

    it("Should create a campaign with minimum duration", async function () {
      const { merkleRewardSystem, rewardToken, lpToken, owner } = await loadFixture(deployMerkleRewardSystemFixture);
      const blockNumber = await ethers.provider.getBlockNumber();
      
      // Use async/await correctly
      await expect(merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        blockNumber + 1,
        blockNumber + 2 // Minimum duration of 1 block
      )).to.not.be.reverted;
    });

    it("Should fail to create a campaign exceeding maximum duration", async function () {
      const { merkleRewardSystem, rewardToken, lpToken } = await loadFixture(deployMerkleRewardSystemFixture);
      const blockNumber = await ethers.provider.getBlockNumber();
      const MAX_CAMPAIGN_DURATION = await merkleRewardSystem.MAX_CAMPAIGN_DURATION();
      
      await expect(merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        blockNumber + 1,
        blockNumber + 1 + MAX_CAMPAIGN_DURATION.add(1) // Exceeding the max
      )).to.be.revertedWith("InvalidCampaignDuration");
    });
  });

  describe("Increase Max Reward Rate", function () {
    it("Should allow creator to increase max reward rate", async function () {
      const { merkleRewardSystem, rewardToken, lpToken, owner } = await loadFixture(deployMerkleRewardSystemFixture);
      const blockNumber = await ethers.provider.getBlockNumber();
      await merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        blockNumber + 100,
        blockNumber + 1000
      );
      await merkleRewardSystem.increaseMaxRewardRate(0, ethers.utils.parseEther("2"));
      const campaign = await merkleRewardSystem.campaigns(0);
      expect(campaign.maxRewardRate).to.equal(ethers.utils.parseEther("2"));
    });

    it("Should not allow non-creator to increase max reward rate", async function () {
      const { merkleRewardSystem, rewardToken, lpToken, owner, user1 } = await loadFixture(deployMerkleRewardSystemFixture);
      const blockNumber = await ethers.provider.getBlockNumber();
      await merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        blockNumber + 100,
        blockNumber + 1000
      );
      await expect(merkleRewardSystem.connect(user1).increaseMaxRewardRate(0, ethers.utils.parseEther("2")))
        .to.be.revertedWith("UnauthorizedAccess");
    });
  });

  describe("Global Merkle Root Updates", function () {
    it("Should update global root", async function () {
      const { merkleRewardSystem, updater } = await loadFixture(deployMerkleRewardSystemFixture);
      const newRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("new root"));
      const updateBlock = await ethers.provider.getBlockNumber();
      await merkleRewardSystem.connect(updater).updateGlobalRoot(newRoot, updateBlock, [], []);
      expect(await merkleRewardSystem.globalMerkleRoot()).to.equal(newRoot);
    });

    it("Should not allow non-updater to update global root", async function () {
      const { merkleRewardSystem, user1 } = await loadFixture(deployMerkleRewardSystemFixture);
      const newRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("new root"));
      const updateBlock = await ethers.provider.getBlockNumber();
      await expect(merkleRewardSystem.connect(user1).updateGlobalRoot(newRoot, updateBlock, [], []))
        .to.be.revertedWith("AccessControl:");
    });
  });

  describe("Reward Claiming", function () {
    it("Should allow valid reward claim", async function () {
      const { merkleRewardSystem, rewardToken, lpToken, owner, updater, user1 } = await loadFixture(deployMerkleRewardSystemFixture);
      const blockNumber = await ethers.provider.getBlockNumber();
      
      // Create campaign
      await merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        blockNumber + 1,
        blockNumber + 1000
      );

      // Create Merkle tree
      const leaves = [
        ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'uint256'],
          [0, user1.address, ethers.utils.parseEther("100")]
        )
      ];
      const merkleTree = new MerkleTree(leaves, keccak256, { sort: true });
      const root = merkleTree.getHexRoot();

      // Update global root
      await merkleRewardSystem.connect(updater).updateGlobalRoot(root, blockNumber + 1, [0], [ethers.utils.parseEther("1000")]);

      // Fund the contract
      await rewardToken.mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));

      // Move to campaign start
      await network.provider.send("hardhat_mine", ["0x1"]);

      // Claim rewards
      const proof = merkleTree.getHexProof(leaves[0]);
      await expect(merkleRewardSystem.connect(user1).claimReward(0, ethers.utils.parseEther("100"), proof))
        .to.not.be.reverted;
      expect(await rewardToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("100"));
    });

    it("Should not allow invalid proof", async function () {
      const { merkleRewardSystem, rewardToken, lpToken, owner, updater, user1 } = await loadFixture(deployMerkleRewardSystemFixture);
      const blockNumber = await ethers.provider.getBlockNumber();
      
      // Create campaign
      await merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        blockNumber + 1,
        blockNumber + 1000
      );

      // Create Merkle tree
      const leaves = [
        ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'uint256'],
          [0, user1.address, ethers.utils.parseEther("100")]
        )
      ];
      const merkleTree = new MerkleTree(leaves, keccak256, { sort: true });
      const root = merkleTree.getHexRoot();

      // Update global root
      await merkleRewardSystem.connect(updater).updateGlobalRoot(root, blockNumber + 1, [0], [ethers.utils.parseEther("1000")]);

      // Fund the contract
      await rewardToken.mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));

      // Move to campaign start
      await network.provider.send("hardhat_mine", ["0x1"]);

      // Try to claim with invalid proof
      const invalidProof = [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("invalid"))];
      await expect(merkleRewardSystem.connect(user1).claimReward(0, ethers.utils.parseEther("100"), invalidProof))
        .to.be.revertedWith("InvalidProof");
    });

    it("Should allow claiming at the start of the campaign", async function () {
      const { merkleRewardSystem, rewardToken, lpToken, owner, updater, user1 } = await loadFixture(deployMerkleRewardSystemFixture);
      const blockNumber = await ethers.provider.getBlockNumber();
      
      // Create campaign
      await merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        ethers.utils.parseEther("1"),
        blockNumber + 1,
        blockNumber + 1000
      );

      // Create Merkle tree
      const leaves = [
        ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'uint256'],
          [0, user1.address, ethers.utils.parseEther("100")]
        )
      ];
      const merkleTree = new MerkleTree(leaves, keccak256, { sort: true });
      const root = merkleTree.getHexRoot();

      // Update global root
      await merkleRewardSystem.connect(updater).updateGlobalRoot(root, blockNumber + 1, [0], [ethers.utils.parseEther("1000")]);

      // Fund the contract
      await rewardToken.mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));

      // Move to campaign start
      await network.provider.send("hardhat_mine", ["0x1"]);

      // Claim rewards
      const proof = merkleTree.getHexProof(leaves[0]);
      await expect(merkleRewardSystem.connect(user1).claimReward(0, ethers.utils.parseEther("100"), proof))
        .to.not.be.reverted;
    });
    it("Should allow claiming at the end of the campaign", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, owner, updater, user1 } = await loadFixture(deployMerkleRewardSystemFixture);
        const blockNumber = await ethers.provider.getBlockNumber();
        
        // Create campaign
        await merkleRewardSystem.createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          blockNumber + 1,
          blockNumber + 10
        );
  
        // Create Merkle tree
        const leaves = [
          ethers.utils.solidityKeccak256(
            ['uint256', 'address', 'uint256'],
            [0, user1.address, ethers.utils.parseEther("100")]
          )
        ];
        const merkleTree = new MerkleTree(leaves, keccak256, { sort: true });
        const root = merkleTree.getHexRoot();
  
        // Update global root
        await merkleRewardSystem.connect(updater).updateGlobalRoot(root, blockNumber + 1, [0], [ethers.utils.parseEther("1000")]);
  
        // Fund the contract
        await rewardToken.mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));
  
        // Move to campaign end
        await network.provider.send("hardhat_mine", ["0xA"]);
  
        // Claim rewards
        const proof = merkleTree.getHexProof(leaves[0]);
        await expect(merkleRewardSystem.connect(user1).claimReward(0, ethers.utils.parseEther("100"), proof))
          .to.not.be.reverted;
      });
  
      it("Should not allow claiming after campaign expiration", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, owner, updater, user1 } = await loadFixture(deployMerkleRewardSystemFixture);
        const blockNumber = await ethers.provider.getBlockNumber();
        
        // Create campaign
        await merkleRewardSystem.createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          blockNumber + 1,
          blockNumber + 10
        );
  
        // Create Merkle tree
        const leaves = [
          ethers.utils.solidityKeccak256(
            ['uint256', 'address', 'uint256'],
            [0, user1.address, ethers.utils.parseEther("100")]
          )
        ];
        const merkleTree = new MerkleTree(leaves, keccak256, { sort: true });
        const root = merkleTree.getHexRoot();
  
        // Update global root
        await merkleRewardSystem.connect(updater).updateGlobalRoot(root, blockNumber + 1, [0], [ethers.utils.parseEther("1000")]);
  
        // Fund the contract
        await rewardToken.mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));
  
        // Move past campaign expiration
        const CLAIM_EXPIRATION = await merkleRewardSystem.CLAIM_EXPIRATION();
        await network.provider.send("hardhat_mine", [ethers.utils.hexValue(CLAIM_EXPIRATION.toNumber() + 11)]);
  
        // Attempt to claim rewards
        const proof = merkleTree.getHexProof(leaves[0]);
        await expect(merkleRewardSystem.connect(user1).claimReward(0, ethers.utils.parseEther("100"), proof))
          .to.be.revertedWith("ClaimNotAllowed");
      });
    });
  
    describe("Multiple Users Claiming", function () {
      it("Should allow multiple users to claim rewards", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, owner, updater, user1, user2, user3 } = await loadFixture(deployMerkleRewardSystemFixture);
        const blockNumber = await ethers.provider.getBlockNumber();
        
        // Create campaign
        await merkleRewardSystem.createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          blockNumber + 1,
          blockNumber + 1000
        );
  
        // Create Merkle tree
        const leaves = [
          ethers.utils.solidityKeccak256(['uint256', 'address', 'uint256'], [0, user1.address, ethers.utils.parseEther("100")]),
          ethers.utils.solidityKeccak256(['uint256', 'address', 'uint256'], [0, user2.address, ethers.utils.parseEther("200")]),
          ethers.utils.solidityKeccak256(['uint256', 'address', 'uint256'], [0, user3.address, ethers.utils.parseEther("300")])
        ];
        const merkleTree = new MerkleTree(leaves, keccak256, { sort: true });
        const root = merkleTree.getHexRoot();
  
        // Update global root
        await merkleRewardSystem.connect(updater).updateGlobalRoot(root, blockNumber + 1, [0], [ethers.utils.parseEther("1000")]);
  
        // Fund the contract
        await rewardToken.mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));
  
        // Move to campaign start
        await network.provider.send("hardhat_mine", ["0x1"]);
  
        // Claim rewards for all users
        for (let i = 0; i < leaves.length; i++) {
          const user = [user1, user2, user3][i];
          const amount = [100, 200, 300][i];
          const proof = merkleTree.getHexProof(leaves[i]);
          await expect(merkleRewardSystem.connect(user).claimReward(0, ethers.utils.parseEther(amount.toString()), proof))
            .to.not.be.reverted;
        }
      });
    });
  
    describe("Exhausting Campaign Rewards", function () {
      it("Should not allow claiming more than available rewards", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, owner, updater, user1, user2 } = await loadFixture(deployMerkleRewardSystemFixture);
        const blockNumber = await ethers.provider.getBlockNumber();
        
        // Create campaign
        await merkleRewardSystem.createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          blockNumber + 1,
          blockNumber + 1000
        );
  
        // Create Merkle tree
        const leaves = [
          ethers.utils.solidityKeccak256(['uint256', 'address', 'uint256'], [0, user1.address, ethers.utils.parseEther("600")]),
          ethers.utils.solidityKeccak256(['uint256', 'address', 'uint256'], [0, user2.address, ethers.utils.parseEther("500")])
        ];
        const merkleTree = new MerkleTree(leaves, keccak256, { sort: true });
        const root = merkleTree.getHexRoot();
  
        // Update global root
        await merkleRewardSystem.connect(updater).updateGlobalRoot(root, blockNumber + 1, [0], [ethers.utils.parseEther("1000")]);
  
        // Fund the contract
        await rewardToken.mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));
  
        // Move to campaign start
        await network.provider.send("hardhat_mine", ["0x1"]);
  
        // Claim rewards for user1
        const proofUser1 = merkleTree.getHexProof(leaves[0]);
        await expect(merkleRewardSystem.connect(user1).claimReward(0, ethers.utils.parseEther("600"), proofUser1))
          .to.not.be.reverted;
  
        // Attempt to claim rewards for user2 (should fail as it exceeds total rewards)
        const proofUser2 = merkleTree.getHexProof(leaves[1]);
        await expect(merkleRewardSystem.connect(user2).claimReward(0, ethers.utils.parseEther("500"), proofUser2))
          .to.be.revertedWith("InsufficientRewardBalance");
      });
    });
  
    describe("Reward Token Withdrawal", function () {
      it("Should allow creator to withdraw unclaimed rewards after campaign end", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, owner } = await loadFixture(deployMerkleRewardSystemFixture);
        const blockNumber = await ethers.provider.getBlockNumber();
        await merkleRewardSystem.createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          blockNumber + 10,
          blockNumber + 1000
        );
  
        // Fund the contract
        await rewardToken.mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));
  
        // Move past campaign end
        await network.provider.send("hardhat_mine", ["0x3E8"]); // 1000 blocks
  
        await merkleRewardSystem.withdrawRewardTokens(0, ethers.utils.parseEther("1000"));
        expect(await rewardToken.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("1000"));
      });
  
      it("Should not allow withdrawal before campaign end", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, owner } = await loadFixture(deployMerkleRewardSystemFixture);
        const blockNumber = await ethers.provider.getBlockNumber();
        await merkleRewardSystem.createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          blockNumber + 10,
          blockNumber + 1000
        );
  
        // Fund the contract
        await rewardToken.mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));
  
        await expect(merkleRewardSystem.withdrawRewardTokens(0, ethers.utils.parseEther("1000")))
          .to.be.revertedWith("CampaignNotEnded");
      });
    });
  
    describe("Pausability", function () {
      it("Should allow admin to pause and unpause", async function () {
        const { merkleRewardSystem, admin } = await loadFixture(deployMerkleRewardSystemFixture);
        await merkleRewardSystem.connect(admin).pause();
        expect(await merkleRewardSystem.paused()).to.be.true;
  
        await merkleRewardSystem.connect(admin).unpause();
        expect(await merkleRewardSystem.paused()).to.be.false;
      });
  
      it("Should not allow non-admin to pause", async function () {
        const { merkleRewardSystem, user1 } = await loadFixture(deployMerkleRewardSystemFixture);
        await expect(merkleRewardSystem.connect(user1).pause())
          .to.be.revertedWith("AccessControl:");
      });
    });
  
    describe("View Functions", function () {
      it("Should return correct campaign details", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, owner } = await loadFixture(deployMerkleRewardSystemFixture);
        const blockNumber = await ethers.provider.getBlockNumber();
        await merkleRewardSystem.createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          blockNumber + 100,
          blockNumber + 1000
        );
  
        const campaign = await merkleRewardSystem.getCampaign(0);
        expect(campaign.creator).to.equal(owner.address);
        expect(campaign.rewardToken).to.equal(rewardToken.address);
        expect(campaign.lpToken).to.equal(lpToken.address);
      });
  
      it("Should return correct claim status", async function () {
        const { merkleRewardSystem, rewardToken, lpToken, user1 } = await loadFixture(deployMerkleRewardSystemFixture);
        const blockNumber = await ethers.provider.getBlockNumber();
        await merkleRewardSystem.createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          blockNumber + 100,
          blockNumber + 1000
        );
  
        expect(await merkleRewardSystem.isClaimProcessed(0, user1.address)).to.be.false;
      });
  
      it("Should return correct available balance", async function () {
        const { merkleRewardSystem, rewardToken, lpToken } = await loadFixture(deployMerkleRewardSystemFixture);
        const blockNumber = await ethers.provider.getBlockNumber();
        await merkleRewardSystem.createCampaign(
          rewardToken.address,
          lpToken.address,
          ethers.utils.parseEther("1"),
          blockNumber + 100,
          blockNumber + 1000
        );
  
        await rewardToken.mint(merkleRewardSystem.address, ethers.utils.parseEther("1000"));
        expect(await merkleRewardSystem.getAvailableBalance(0)).to.equal(ethers.utils.parseEther("1000"));
      });
    });
  });