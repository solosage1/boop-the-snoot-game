const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
require("dotenv").config({ path: "./.env" });

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
    user3Wallet,
    rewardToken,
    lpToken,
    secondRewardToken;
  const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
  const UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATER_ROLE"));
  let ownerLPBalance, campaignRewardAmount;
  let firstCampaignId, secondCampaignId;
  let rewardTokenDecimals, lpTokenDecimals, secondRewardTokenDecimals;
  let provider;

  const fixedGasLimit = 500000; // Adjust this value as needed

  this.timeout(600000);

  before(async function () {
    try {
      const {
        PRIVATE_KEY,
        BARTIO_RPC_URL,
        DEPLOYED_CONTRACT_ADDRESS,
        LP_TOKEN_ADDRESS,
        REWARD_TOKEN_ADDRESS,
        SECOND_REWARD_TOKEN_ADDRESS,
      } = process.env;

      if (!PRIVATE_KEY || !BARTIO_RPC_URL || !DEPLOYED_CONTRACT_ADDRESS || !LP_TOKEN_ADDRESS || !REWARD_TOKEN_ADDRESS || !SECOND_REWARD_TOKEN_ADDRESS) {
        throw new Error("Missing required environment variables");
      }

      provider = new ethers.providers.JsonRpcProvider(BARTIO_RPC_URL);
      owner = new ethers.Wallet(PRIVATE_KEY, provider);
      console.log("Owner address:", owner.address);

      user1Wallet = ethers.Wallet.createRandom().connect(provider);
      user2Wallet = ethers.Wallet.createRandom().connect(provider);
      user3Wallet = ethers.Wallet.createRandom().connect(provider);
      console.log("User1 address:", user1Wallet.address);
      console.log("User2 address:", user2Wallet.address);
      console.log("User3 address:", user3Wallet.address);

      const merkleRewardSystemABI = require("../../artifacts/contracts/MerkleRewardSystem.sol/MerkleRewardSystem.json").abi;
      merkleRewardSystem = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS,
        merkleRewardSystemABI,
        owner
      );
      console.log("MerkleRewardSystem connected at address:", merkleRewardSystem.address);

      lpToken = new ethers.Contract(LP_TOKEN_ADDRESS, ERC20_ABI, owner);
      console.log("LPToken connected at address:", lpToken.address);

      rewardToken = new ethers.Contract(REWARD_TOKEN_ADDRESS, ERC20_ABI, owner);
      console.log("RewardToken connected at address:", rewardToken.address);

      secondRewardToken = new ethers.Contract(SECOND_REWARD_TOKEN_ADDRESS, ERC20_ABI, owner);
      console.log("SecondRewardToken connected at address:", secondRewardToken.address);

      lpTokenDecimals = await lpToken.decimals();
      rewardTokenDecimals = await rewardToken.decimals();
      secondRewardTokenDecimals = await secondRewardToken.decimals();

      if (!(await merkleRewardSystem.hasRole(ADMIN_ROLE, owner.address))) {
        await (await merkleRewardSystem.grantRole(ADMIN_ROLE, owner.address, { gasLimit: fixedGasLimit })).wait();
        console.log("ADMIN_ROLE granted to owner");
      }
      if (!(await merkleRewardSystem.hasRole(UPDATER_ROLE, owner.address))) {
        await (await merkleRewardSystem.grantRole(UPDATER_ROLE, owner.address, { gasLimit: fixedGasLimit })).wait();
        console.log("UPDATER_ROLE granted to owner");
      }

      if (!(await merkleRewardSystem.whitelistedTokens(rewardToken.address))) {
        await (await merkleRewardSystem.whitelistToken(rewardToken.address, { gasLimit: fixedGasLimit })).wait();
        console.log("RewardToken whitelisted");
      }
      if (!(await merkleRewardSystem.whitelistedTokens(secondRewardToken.address))) {
        await (await merkleRewardSystem.whitelistToken(secondRewardToken.address, { gasLimit: fixedGasLimit })).wait();
        console.log("SecondRewardToken whitelisted");
      }

      ownerLPBalance = await lpToken.balanceOf(owner.address);
      console.log("Owner LP Token Balance:", ethers.utils.formatUnits(ownerLPBalance, lpTokenDecimals));

      campaignRewardAmount = ownerLPBalance.mul(10).div(100);
      console.log("Campaign Reward Amount (10% of owner's balance):", ethers.utils.formatUnits(campaignRewardAmount, lpTokenDecimals));

      if (campaignRewardAmount.isZero()) {
        throw new Error("Owner's LP token balance is too low to create a campaign with 10% of the balance.");
      }

      const ownerEthBalance = await provider.getBalance(owner.address);
      console.log("Owner ETH Balance:", ethers.utils.formatEther(ownerEthBalance));

      const transferAmount = ethers.utils.parseEther("0.01");
      if (ownerEthBalance.gt(transferAmount.mul(3))) {
        await (await owner.sendTransaction({ to: user1Wallet.address, value: transferAmount, gasLimit: fixedGasLimit })).wait();
        await (await owner.sendTransaction({ to: user2Wallet.address, value: transferAmount, gasLimit: fixedGasLimit })).wait();
        await (await owner.sendTransaction({ to: user3Wallet.address, value: transferAmount, gasLimit: fixedGasLimit })).wait();
        console.log("Transferred 0.01 ETH to each user wallet for gas");
      } else {
        console.log("Owner doesn't have enough ETH to transfer. Skipping ETH transfer to user wallets.");
      }

      const userLPAmount = ownerLPBalance.mul(5).div(100);
      if (userLPAmount.isZero()) {
        throw new Error("User LP token amount is zero. Cannot transfer tokens to users.");
      }

      await (await lpToken.transfer(user1Wallet.address, userLPAmount, { gasLimit: fixedGasLimit })).wait();
      await (await lpToken.transfer(user2Wallet.address, userLPAmount, { gasLimit: fixedGasLimit })).wait();
      await (await lpToken.transfer(user3Wallet.address, userLPAmount, { gasLimit: fixedGasLimit })).wait();

      console.log("User1 LP Token Balance:", ethers.utils.formatUnits(await lpToken.balanceOf(user1Wallet.address), lpTokenDecimals));
      console.log("User2 LP Token Balance:", ethers.utils.formatUnits(await lpToken.balanceOf(user2Wallet.address), lpTokenDecimals));
      console.log("User3 LP Token Balance:", ethers.utils.formatUnits(await lpToken.balanceOf(user3Wallet.address), lpTokenDecimals));

      const ownerRewardBalance = await rewardToken.balanceOf(owner.address);
      console.log("Owner reward token balance:", ethers.utils.formatUnits(ownerRewardBalance, rewardTokenDecimals));

      if (ownerRewardBalance.lt(campaignRewardAmount)) {
        throw new Error("Owner does not have enough reward tokens to fund the campaign.");
      }

      await (await rewardToken.approve(merkleRewardSystem.address, ethers.constants.MaxUint256, { gasLimit: fixedGasLimit })).wait();
      console.log("Approved MerkleRewardSystem to spend reward tokens");

      await (await secondRewardToken.approve(merkleRewardSystem.address, ethers.constants.MaxUint256, { gasLimit: fixedGasLimit })).wait();
      console.log("Approved MerkleRewardSystem to spend second reward tokens");
    } catch (error) {
      console.error("Error in before hook:", error);
      throw error;
    }
  });

  it("Should create a campaign", async function () {
    try {
      const currentBlock = await provider.getBlockNumber();
      const startBlock = currentBlock + 5;
      const campaignDurationBlocks = 100;
      const endBlock = startBlock + campaignDurationBlocks;

      const maxRewardRate = campaignRewardAmount.div(campaignDurationBlocks);
      console.log("Creating campaign with params:", {
        rewardToken: rewardToken.address,
        lpToken: lpToken.address,
        maxRewardRate: ethers.utils.formatUnits(maxRewardRate, rewardTokenDecimals),
        startBlock,
        endBlock,
        totalRewardAmount: ethers.utils.formatUnits(campaignRewardAmount, rewardTokenDecimals)
      });

      const createCampaignTx = await merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        maxRewardRate,
        startBlock,
        endBlock,
        campaignRewardAmount,
        { gasLimit: fixedGasLimit }
      );
      const receipt = await createCampaignTx.wait();

      const campaignCreatedEvent = receipt.events.find(
        (event) => event.event === "CampaignCreated"
      );
      expect(campaignCreatedEvent).to.not.be.undefined;

      firstCampaignId = campaignCreatedEvent.args.campaignId;
      console.log("First campaign created with ID:", firstCampaignId.toString());

      const campaign = await merkleRewardSystem.campaigns(firstCampaignId);
      expect(campaign.creator).to.equal(owner.address);
      expect(campaign.rewardToken).to.equal(rewardToken.address);
      expect(campaign.lpToken).to.equal(lpToken.address);
      expect(campaign.totalRewards).to.equal(campaignRewardAmount);

      const estimatedDurationSeconds = campaignDurationBlocks * 3;
      console.log(`Estimated campaign duration: ${estimatedDurationSeconds} seconds`);
    } catch (error) {
      console.error("Error in createCampaign:", error);
      throw error;
    }
  });

  it("Should allow increasing max reward rate", async function () {
    const newMaxRate = ethers.utils.parseUnits("2", rewardTokenDecimals);
    const tx = await merkleRewardSystem.increaseMaxRewardRate(firstCampaignId, newMaxRate, { gasLimit: fixedGasLimit });
    const receipt = await tx.wait();
    
    const event = receipt.events.find(e => e.event === "MaxRewardRateIncreased");
    expect(event).to.not.be.undefined;
    expect(event.args.campaignId).to.equal(firstCampaignId);
    expect(event.args.newMaxRate).to.equal(newMaxRate);

    const campaign = await merkleRewardSystem.campaigns(firstCampaignId);
    expect(campaign.maxRewardRate).to.equal(newMaxRate);
  });

  it("Should not allow non-creator to increase max reward rate", async function () {
    const newMaxRate = ethers.utils.parseUnits("3", rewardTokenDecimals);
    await expect(merkleRewardSystem.connect(user1Wallet).increaseMaxRewardRate(firstCampaignId, newMaxRate, { gasLimit: fixedGasLimit }))
      .to.be.revertedWith("UnauthorizedAccess");
  });

  it("Should allow depositing additional rewards", async function () {
    const additionalRewards = ethers.utils.parseUnits("100", rewardTokenDecimals);
    await rewardToken.approve(merkleRewardSystem.address, additionalRewards, { gasLimit: fixedGasLimit });
    
    const tx = await merkleRewardSystem.depositRewards(firstCampaignId, additionalRewards, { gasLimit: fixedGasLimit });
    const receipt = await tx.wait();
    
    const event = receipt.events.find(e => e.event === "RewardTokensDeposited");
    expect(event).to.not.be.undefined;
    expect(event.args.campaignId).to.equal(firstCampaignId);
    expect(event.args.depositor).to.equal(owner.address);
    expect(event.args.amount).to.equal(additionalRewards);

    const campaign = await merkleRewardSystem.campaigns(firstCampaignId);
    expect(campaign.totalRewards).to.equal(campaignRewardAmount.add(additionalRewards));
  });

  it("Should update global Merkle root", async function () {
    const users = [user1Wallet, user2Wallet, user3Wallet];
    const userEntitlements = users.map(() => ethers.utils.parseUnits("100", rewardTokenDecimals));

    const leaves = users.map((user, index) =>
      ethers.utils.solidityKeccak256(
        ["address", "uint256"],
        [user.address, userEntitlements[index]]
      )
    );

    const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const root = merkleTree.getHexRoot();

    const updateBlock = await provider.getBlockNumber();
    const tx = await merkleRewardSystem.updateGlobalRoot(root, updateBlock, { gasLimit: fixedGasLimit });
    const receipt = await tx.wait();

    const event = receipt.events.find(e => e.event === "GlobalRootUpdated");
    expect(event).to.not.be.undefined;
    expect(event.args.newRoot).to.equal(root);
    expect(event.args.updateBlock).to.equal(updateBlock);

    expect(await merkleRewardSystem.globalMerkleRoot()).to.equal(root);
    expect(await merkleRewardSystem.lastUpdateBlock()).to.equal(updateBlock);
  });

  it("Should allow users to claim rewards", async function () {
    const users = [user1Wallet, user2Wallet, user3Wallet];
    const userEntitlements = users.map(() => ethers.utils.parseUnits("100", rewardTokenDecimals));

    const leaves = users.map((user, index) =>
      ethers.utils.solidityKeccak256(
        ["address", "uint256"],
        [user.address, userEntitlements[index]]
      )
    );

    const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const proof = merkleTree.getHexProof(leaves[i]);
      const claimAmount = userEntitlements[i].div(2); // Claim half of the entitlement

      console.log(`Claiming for user ${i + 1}:`, user.address);
      console.log("Claim amount:", ethers.utils.formatUnits(claimAmount, rewardTokenDecimals));
      console.log("Merkle proof:", proof);

      const balanceBefore = await rewardToken.balanceOf(user.address);

      const tx = await merkleRewardSystem.connect(user).claimSingleReward(
        rewardToken.address,
        userEntitlements[i],
        claimAmount,
        proof,
        { gasLimit: fixedGasLimit }
      );
      const receipt = await tx.wait();

      const event = receipt.events.find(e => e.event === "SingleRewardClaimed");
      expect(event).to.not.be.undefined;
      expect(event.args.user).to.equal(user.address);
      expect(event.args.token).to.equal(rewardToken.address);
      expect(event.args.amount).to.equal(claimAmount);

      const balanceAfter = await rewardToken.balanceOf(user.address);
      expect(balanceAfter.sub(balanceBefore)).to.equal(claimAmount);

      const claimedAmount = await merkleRewardSystem.getUserClaimedAmount(user.address, rewardToken.address);
      expect(claimedAmount).to.equal(claimAmount);
    }
  });

  it("Should not allow claiming more than entitled amount", async function () {
    const user = user1Wallet;
    const entitlement = ethers.utils.parseUnits("100", rewardTokenDecimals);
    const overClaimAmount = entitlement.add(1);

    const leaf = ethers.utils.solidityKeccak256(
      ["address", "uint256"],
      [user.address, entitlement]
    );
    const merkleTree = new MerkleTree([leaf], keccak256, { sortPairs: true });
    const proof = merkleTree.getHexProof(leaf);

    await expect(merkleRewardSystem.connect(user).claimSingleReward(
      rewardToken.address,
      entitlement,
      overClaimAmount,
      proof,
      { gasLimit: fixedGasLimit }
    )).to.be.revertedWith("ExceedsEntitlement");
  });

  it("Should create a campaign with second reward token", async function () {
    const currentBlock = await provider.getBlockNumber();
    const startBlock = currentBlock + 5;
    const campaignDurationBlocks = 100;
    const endBlock = startBlock + campaignDurationBlocks;

    const maxRewardRate = campaignRewardAmount.div(campaignDurationBlocks);

    console.log("Creating second campaign with params:", {
      rewardToken: secondRewardToken.address,
      lpToken: lpToken.address,
      maxRewardRate: ethers.utils.formatUnits(maxRewardRate, secondRewardTokenDecimals),
      startBlock,
      endBlock,
      totalRewardAmount: ethers.utils.formatUnits(campaignRewardAmount, secondRewardTokenDecimals)
    });

    const createCampaignTx = await merkleRewardSystem.createCampaign(
      secondRewardToken.address,
      lpToken.address,
      maxRewardRate,
      startBlock,
      endBlock,
      campaignRewardAmount,
      { gasLimit: fixedGasLimit }
    );
    const receipt = await createCampaignTx.wait();

    const campaignCreatedEvent = receipt.events.find(
      (event) => event.event === "CampaignCreated"
    );
    expect(campaignCreatedEvent).to.not.be.undefined;

    secondCampaignId = campaignCreatedEvent.args.campaignId;
    console.log("Second campaign created with ID:", secondCampaignId.toString());

    const campaign = await merkleRewardSystem.campaigns(secondCampaignId);
    expect(campaign.creator).to.equal(owner.address);
    expect(campaign.rewardToken).to.equal(secondRewardToken.address);
    expect(campaign.lpToken).to.equal(lpToken.address);
    expect(campaign.totalRewards).to.equal(campaignRewardAmount);
  });

  it("Should allow batch claiming of rewards", async function () {
    const users = [user1Wallet, user2Wallet, user3Wallet];
    const tokens = [rewardToken.address, secondRewardToken.address];
    const userEntitlements = users.map(() => 
      tokens.map(() => ethers.utils.parseUnits("50", rewardTokenDecimals))
    );

    const leaves = users.map((user, index) =>
      ethers.utils.solidityKeccak256(
        ["address", "address[]", "uint256[]"],
        [user.address, tokens, userEntitlements[index]]
      )
    );

    const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const root = merkleTree.getHexRoot();

    const updateBlock = await provider.getBlockNumber();
    await merkleRewardSystem.updateGlobalRoot(root, updateBlock, { gasLimit: fixedGasLimit });

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const proof = merkleTree.getHexProof(leaves[i]);
      const claimAmounts = userEntitlements[i].map(amount => amount.div(2)); // Claim half of each entitlement

      console.log(`Batch claiming for user ${i + 1}:`, user.address);
      console.log("Claim amounts:", claimAmounts.map(amount => ethers.utils.formatUnits(amount, rewardTokenDecimals)));
      console.log("Merkle proof:", proof);

      const balancesBefore = await Promise.all(tokens.map(token => 
        new ethers.Contract(token, ERC20_ABI, provider).balanceOf(user.address)
      ));

      const tx = await merkleRewardSystem.connect(user).batchClaimRewards(
        tokens,
        userEntitlements[i],
        claimAmounts,
        proof,
        { gasLimit: fixedGasLimit }
      );
      const receipt = await tx.wait();

      const event = receipt.events.find(e => e.event === "BatchRewardsClaimed");
      expect(event).to.not.be.undefined;
      expect(event.args.user).to.equal(user.address);
      expect(event.args.tokens).to.deep.equal(tokens);
      expect(event.args.amounts).to.deep.equal(claimAmounts);

      const balancesAfter = await Promise.all(tokens.map(token => 
        new ethers.Contract(token, ERC20_ABI, provider).balanceOf(user.address)
      ));

      for (let j = 0; j < tokens.length; j++) {
        expect(balancesAfter[j].sub(balancesBefore[j])).to.equal(claimAmounts[j]);

        const claimedAmount = await merkleRewardSystem.getUserClaimedAmount(user.address, tokens[j]);
        expect(claimedAmount).to.equal(claimAmounts[j]);
      }
    }
  });

  it("Should not allow batch claiming with too many tokens", async function () {
    const user = user1Wallet;
    const maxTokensPerBatch = await merkleRewardSystem.maxTokensPerBatch();
    const tokens = Array(maxTokensPerBatch.add(1).toNumber()).fill(rewardToken.address);
    const entitlements = tokens.map(() => ethers.utils.parseUnits("50", rewardTokenDecimals));
    const claimAmounts = entitlements.map(amount => amount.div(2));

    const leaf = ethers.utils.solidityKeccak256(
      ["address", "address[]", "uint256[]"],
      [user.address, tokens, entitlements]
    );
    const merkleTree = new MerkleTree([leaf], keccak256, { sortPairs: true });
    const proof = merkleTree.getHexProof(leaf);

    await expect(merkleRewardSystem.connect(user).batchClaimRewards(
      tokens,
      entitlements,
      claimAmounts,
      proof,
      { gasLimit: fixedGasLimit }
    )).to.be.revertedWith("TooManyTokens");
  });

  it("Should allow admin to set max tokens per batch", async function () {
    const newMaxTokensPerBatch = 10;
    const tx = await merkleRewardSystem.setMaxTokensPerBatch(newMaxTokensPerBatch, { gasLimit: fixedGasLimit });
    await tx.wait();

    const updatedMaxTokensPerBatch = await merkleRewardSystem.maxTokensPerBatch();
    expect(updatedMaxTokensPerBatch).to.equal(newMaxTokensPerBatch);
  });

  it("Should not allow non-admin to set max tokens per batch", async function () {
    await expect(merkleRewardSystem.connect(user1Wallet).setMaxTokensPerBatch(15, { gasLimit: fixedGasLimit }))
      .to.be.revertedWith("AccessControl:");
  });

  it("Should allow withdrawal of unclaimed rewards after campaign end", async function () {
    // Wait for the campaign to end
    const campaign = await merkleRewardSystem.campaigns(firstCampaignId);
    while ((await provider.getBlockNumber()) <= campaign.endBlock) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const availableBalance = await merkleRewardSystem.getAvailableBalance(firstCampaignId);
    const initialBalance = await rewardToken.balanceOf(owner.address);

    console.log("Available balance for withdrawal:", ethers.utils.formatUnits(availableBalance, rewardTokenDecimals));

    const tx = await merkleRewardSystem.withdrawRewardTokens(firstCampaignId, availableBalance, { gasLimit: fixedGasLimit });
    const receipt = await tx.wait();

    const event = receipt.events.find(e => e.event === "RewardTokensWithdrawn");
    expect(event).to.not.be.undefined;
    expect(event.args.campaignId).to.equal(firstCampaignId);
    expect(event.args.recipient).to.equal(owner.address);
    expect(event.args.amount).to.equal(availableBalance);

    const finalBalance = await rewardToken.balanceOf(owner.address);
    expect(finalBalance.sub(initialBalance)).to.equal(availableBalance);
  });

  it("Should not allow withdrawal before campaign end", async function () {
    const currentBlock = await provider.getBlockNumber();
    const startBlock = currentBlock + 5;
    const endBlock = startBlock + 100;

    const createCampaignTx = await merkleRewardSystem.createCampaign(
      rewardToken.address,
      lpToken.address,
      ethers.utils.parseUnits("1", rewardTokenDecimals),
      startBlock,
      endBlock,
      campaignRewardAmount,
      { gasLimit: fixedGasLimit }
    );
    const receipt = await createCampaignTx.wait();
    const newCampaignId = receipt.events.find(e => e.event === "CampaignCreated").args.campaignId;

    await expect(merkleRewardSystem.withdrawRewardTokens(newCampaignId, campaignRewardAmount, { gasLimit: fixedGasLimit }))
      .to.be.revertedWith("CampaignNotEnded");
  });

  it("Should allow admin to pause and unpause the contract", async function () {
    const pauseTx = await merkleRewardSystem.pause({ gasLimit: fixedGasLimit });
    await pauseTx.wait();

    expect(await merkleRewardSystem.paused()).to.be.true;

    const unpauseTx = await merkleRewardSystem.unpause({ gasLimit: fixedGasLimit });
    await unpauseTx.wait();

    expect(await merkleRewardSystem.paused()).to.be.false;
  });

  it("Should not allow non-admin to pause or unpause", async function () {
    await expect(merkleRewardSystem.connect(user1Wallet).pause({ gasLimit: fixedGasLimit }))
      .to.be.revertedWith("AccessControl:");

    await expect(merkleRewardSystem.connect(user1Wallet).unpause({ gasLimit: fixedGasLimit }))
      .to.be.revertedWith("AccessControl:");
  });

  it("Should return correct campaign details", async function () {
    const campaignDetails = await merkleRewardSystem.getCampaign(firstCampaignId);
    expect(campaignDetails.creator).to.equal(owner.address);
    expect(campaignDetails.rewardToken).to.equal(rewardToken.address);
    expect(campaignDetails.lpToken).to.equal(lpToken.address);
  });

  it("Should return correct campaign status", async function () {
    const status = await merkleRewardSystem.getCampaignStatus(firstCampaignId);
    expect(status).to.be.oneOf([0, 1]); // 0 for Inactive, 1 for Active
  });

  it("Should return correct campaign timing", async function () {
    const [startBlock, endBlock] = await merkleRewardSystem.getCampaignTiming(firstCampaignId);
    expect(startBlock).to.be.gt(0);
    expect(endBlock).to.be.gt(startBlock);
  });

  it("Should return correct campaign LP token", async function () {
    const campaignLPToken = await merkleRewardSystem.getCampaignLPToken(firstCampaignId);
    expect(campaignLPToken).to.equal(lpToken.address);
  });

  it("Should return correct campaign IDs", async function () {
    const totalCampaigns = await merkleRewardSystem.totalCampaigns();
    const campaignIds = await merkleRewardSystem.getCampaignIds(0, totalCampaigns);
    expect(campaignIds.length).to.equal(totalCampaigns.toNumber());
    expect(campaignIds).to.include(firstCampaignId);
    expect(campaignIds).to.include(secondCampaignId);
  });
});