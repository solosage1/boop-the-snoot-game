const { expect } = require('chai');
const { ethers } = require('hardhat');
require('dotenv').config();
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

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
    const MerkleRewardSystemFactory = await ethers.getContractFactory("MerkleRewardSystem", owner);
    merkleRewardSystem = MerkleRewardSystemFactory.attach(DEPLOYED_CONTRACT_ADDRESS);

    // Define ERC20 ABI
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

    // Connect to existing Reward Token and LP Token
    rewardToken = new ethers.Contract(REWARD_TOKEN_ADDRESS, ERC20_ABI, owner);
    lpToken = new ethers.Contract(LP_TOKEN_ADDRESS, ERC20_ABI, owner);

    console.log("Reward Token Address:", rewardToken.address);
    console.log("LP Token Address:", lpToken.address);

    // Mint reward tokens to the owner if necessary
    const mintAmount = ethers.utils.parseEther("1000");
    const ownerRewardBalance = await rewardToken.balanceOf(owner.address);
    console.log("Owner Reward Token Balance Before Minting:", ethers.utils.formatEther(ownerRewardBalance));
    if (ownerRewardBalance.lt(mintAmount)) {
      const mintTx = await rewardToken.mint(owner.address, mintAmount.sub(ownerRewardBalance));
      await mintTx.wait();
      console.log("Minted reward tokens to the owner.");
    }

    const updatedOwnerRewardBalance = await rewardToken.balanceOf(owner.address);
    console.log("Owner Reward Token Balance After Minting:", ethers.utils.formatEther(updatedOwnerRewardBalance));

    // Check LP token balance and calculate 10% for testing
    let lpBalance = await lpToken.balanceOf(owner.address);
    const lpTestAmount = lpBalance.div(10);
    console.log("LP token balance:", ethers.utils.formatEther(lpBalance));
    console.log("LP test amount (10% of balance):", ethers.utils.formatEther(lpTestAmount));

    // Whitelist tokens
    const ADMIN_ROLE = await merkleRewardSystem.ADMIN_ROLE();

    const hasAdminRole = await merkleRewardSystem.hasRole(ADMIN_ROLE, owner.address);

    if (!hasAdminRole) {
      console.log("Granting ADMIN_ROLE to the owner...");
      const grantRoleTx = await merkleRewardSystem.grantRole(ADMIN_ROLE, owner.address);
      await grantRoleTx.wait();
      console.log("ADMIN_ROLE granted to the owner.");
    } else {
      console.log("Owner already has ADMIN_ROLE. Cannot whitelist tokens.");
    }

    // Whitelist Reward Token
    const isRewardTokenWhitelisted = await merkleRewardSystem.whitelistedTokens(rewardToken.address);
    if (!isRewardTokenWhitelisted) {
      const whitelistTx = await merkleRewardSystem.whitelistToken(rewardToken.address);
      await whitelistTx.wait();
      console.log("Whitelisted the reward token.");
    }

    // Whitelist LP Token (if applicable in your contract)
    // If your contract requires LP tokens to be whitelisted, implement similar logic

    // Verify token whitelisting
    const isLPTokenWhitelisted = await merkleRewardSystem.whitelistedTokens(lpToken.address);
    console.log("Reward token whitelisted:", isRewardTokenWhitelisted);
    console.log("LP token whitelisted:", isLPTokenWhitelisted);

    // Check owner's reward token balance
    const ownerBalance = await rewardToken.balanceOf(owner.address);
    console.log("Owner reward token balance:", ethers.utils.formatEther(ownerBalance));

    // Verify reward token allowance
    const allowance = await rewardToken.allowance(owner.address, merkleRewardSystem.address);
    console.log("Reward token allowance:", ethers.utils.formatEther(allowance));

    // Whitelist LP token if necessary
    if (!isLPTokenWhitelisted) {
      console.log("Whitelisting LP token...");
      const whitelistLPTokenTx = await merkleRewardSystem.whitelistToken(lpToken.address);
      await whitelistLPTokenTx.wait();
      console.log("LP token whitelisted");
    }

    // Grant UPDATER_ROLE to the owner
    const UPDATER_ROLE = await merkleRewardSystem.UPDATER_ROLE();
    const hasUpdaterRole = await merkleRewardSystem.hasRole(UPDATER_ROLE, owner.address);
    if (!hasUpdaterRole) {
      const grantRoleTx = await merkleRewardSystem.grantRole(UPDATER_ROLE, owner.address);
      await grantRoleTx.wait();
      console.log("Granted UPDATER_ROLE to the owner.");
    }
  });

  it("Should create a campaign and allow the owner to claim rewards", async function () {
    // Before creating the campaign
    const isRewardTokenWhitelisted = await merkleRewardSystem.whitelistedTokens(rewardToken.address);
    console.log("Is reward token whitelisted:", isRewardTokenWhitelisted);

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const startTimestamp = currentTimestamp + 15; // Starts in 15 seconds
    const endTimestamp = startTimestamp + 3600;   // Ends in 1 hour

    const totalRewardAmount = ethers.utils.parseEther("10");
    const maxRewardRate = ethers.utils.parseEther("1");

    // Approve reward tokens
    const ownerBalance = await rewardToken.balanceOf(owner.address);
    if (ownerBalance.lt(totalRewardAmount)) {
      console.error("Insufficient reward token balance for the campaign.");
      return;
    }

    const allowance = await rewardToken.allowance(owner.address, merkleRewardSystem.address);
    if (allowance.lt(totalRewardAmount)) {
      const approveTx = await rewardToken.approve(merkleRewardSystem.address, totalRewardAmount);
      await approveTx.wait();
      console.log("Approved reward tokens for the contract.");
    }

    // Create campaign with error handling
    try {
      const createTx = await merkleRewardSystem.createCampaign(
        rewardToken.address,
        lpToken.address,
        maxRewardRate,
        startTimestamp,
        endTimestamp,
        totalRewardAmount,
        { gasLimit: 1000000 }
      );
      await createTx.wait();
      console.log("Campaign created successfully");
    } catch (error) {
      console.error("Detailed error:", error);
      throw error;
    }

    // Get campaign ID
    const campaignCount = await merkleRewardSystem.campaignCount();
    const campaignId = campaignCount.sub(1);
    console.log("Created campaign ID:", campaignId.toString());

    // Generate Merkle Tree and proof
    const userAddress = owner.address; // Using owner as the test user
    const claimAmount = ethers.utils.parseEther("5");

    const leafNodes = [
      ethers.utils.solidityKeccak256(
        ['uint256', 'address', 'uint256'],
        [campaignId, userAddress, claimAmount]
      )
    ];

    const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
    const root = merkleTree.getHexRoot();
    const proof = merkleTree.getHexProof(leafNodes[0]);

    // Update the global Merkle root
    const lastUpdateTimestamp = await merkleRewardSystem.lastUpdateTimestamp();
    const updateTimestamp = Math.floor(Date.now() / 1000);

    if (updateTimestamp <= lastUpdateTimestamp) {
      console.error("Invalid update timestamp: must be greater than last update timestamp.");
      return;
    }

    const updateRootTx = await merkleRewardSystem.updateGlobalRoot(root, updateTimestamp);
    await updateRootTx.wait();
    console.log("Updated global Merkle root.");

    // Wait until campaign starts (max 15 seconds as per constraints)
    console.log("Waiting for campaign to start...");
    const waitTime = startTimestamp - Math.floor(Date.now() / 1000);
    if (waitTime > 0 && waitTime <= 15) {
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
    } else if (waitTime > 15) {
      throw new Error("Wait time exceeds 15 seconds, test aborted.");
    }

    // Claim rewards
    try {
      const claimTx = await merkleRewardSystem.claimRewards(
        [campaignId],
        [claimAmount],
        [proof]
      );
      const claimReceipt = await claimTx.wait();
      console.log("Rewards successfully claimed. Transaction hash:", claimReceipt.transactionHash);
    } catch (error) {
      console.error("Detailed error during rewards claiming:", error);
      throw error;
    }

    // Verify claimed amount
    const claimedAmount = await merkleRewardSystem.getUserClaimedAmount(campaignId, userAddress);
    expect(claimedAmount).to.equal(claimAmount);
    console.log("Claimed amount verified.");
  });

  it("Should not allow claiming with invalid proof", async function () {
    // Create a new campaign
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const startTimestamp = currentTimestamp + 5;
    const endTimestamp = startTimestamp + 30;

    const totalRewardAmount = ethers.utils.parseEther("10");
    const maxRewardRate = ethers.utils.parseEther("1");

    // Approve reward tokens to the contract
    const approveTx = await rewardToken.approve(merkleRewardSystem.address, totalRewardAmount);
    await approveTx.wait();
    console.log("Approved reward tokens for the new campaign.");

    // Create campaign
    const createTx = await merkleRewardSystem.createCampaign(
      rewardToken.address,
      lpToken.address,
      maxRewardRate,
      startTimestamp,
      endTimestamp,
      totalRewardAmount,
      { gasLimit: 500000 }
    );
    await createTx.wait();
    console.log("New campaign created.");

    // Get campaign ID
    const campaignCount = await merkleRewardSystem.campaignCount();
    const campaignId = campaignCount.sub(1);
    console.log("New campaign ID:", campaignId.toString());

    // Generate a valid leaf, but use an invalid proof
    const userAddress = owner.address;
    const invalidClaimAmount = ethers.utils.parseEther("15"); // Amount not in Merkle Tree

    const validLeaf = ethers.utils.solidityKeccak256(
      ['uint256', 'address', 'uint256'],
      [campaignId, userAddress, ethers.utils.parseEther("5")]
    );
    const invalidLeaf = ethers.utils.solidityKeccak256(
      ['uint256', 'address', 'uint256'],
      [campaignId, userAddress, invalidClaimAmount]
    );
    const merkleTree = new MerkleTree([validLeaf], keccak256, { sortPairs: true });
    const invalidProof = merkleTree.getHexProof(invalidLeaf);

    // Update the global Merkle root
    const root = merkleTree.getHexRoot();
    await merkleRewardSystem.updateGlobalRoot(root, startTimestamp - 10);

    // Wait for the campaign to start
    const delay = startTimestamp - Math.floor(Date.now() / 1000) + 1;
    if (delay > 0) {
      console.log(`Waiting ${delay} seconds for the campaign to start...`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }

    // Attempt to claim with invalid proof
    try {
      await merkleRewardSystem.claimRewards(
        [campaignId],
        [invalidClaimAmount],
        [invalidProof],
        { gasLimit: 500000 }
      );
      // If no error is thrown, the test should fail
      expect.fail("Expected transaction to fail, but it succeeded.");
    } catch (error) {
      console.log("Transaction failed as expected:", error.message);
      // Optionally, you can add assertions to check the error message or code
      expect(error.message).to.include("CALL_EXCEPTION");
    }
  });
});