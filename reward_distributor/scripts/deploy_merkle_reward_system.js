const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy MerkleRewardSystem
  const MerkleRewardSystem = await hre.ethers.getContractFactory("MerkleRewardSystem");
  const merkleRewardSystem = await MerkleRewardSystem.deploy();
  await merkleRewardSystem.deployed();
  console.log("MerkleRewardSystem deployed to:", merkleRewardSystem.address);

  // Deploy RewardToken
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const rewardToken = await MockERC20.deploy("Reward Token", "RWD");
  await rewardToken.deployed();
  console.log("RewardToken deployed to:", rewardToken.address);

  // Deploy SecondRewardToken
  const secondRewardToken = await MockERC20.deploy("Second Reward Token", "RWD2");
  await secondRewardToken.deployed();
  console.log("SecondRewardToken deployed to:", secondRewardToken.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });