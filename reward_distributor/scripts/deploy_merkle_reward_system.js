const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const MerkleRewardSystem = await hre.ethers.getContractFactory("MerkleRewardSystem");
  const merkleRewardSystem = await MerkleRewardSystem.deploy();

  await merkleRewardSystem.deployed();

  console.log("MerkleRewardSystem deployed to:", merkleRewardSystem.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });