// scripts/test-ethers-utils.js

const { ethers } = require("hardhat");

console.log("🔍 ethers.version:", ethers.version);
console.log("🔍 ethers.utils is defined:", ethers.utils !== undefined);
if (!ethers.utils) {
  throw new Error("ethers.utils is undefined. Check your import statements.");
}

async function main() {
  try {
    // Parsing Ether to Wei
    const valueInWei = ethers.utils.parseEther("1.0");
    console.log("🔸 Parsed Ether to Wei:", valueInWei.toString());

    // Formatting Wei back to Ether
    const valueInEther = ethers.utils.formatEther(valueInWei);
    console.log("🔸 Formatted Wei back to Ether:", valueInEther);
  } catch (error) {
    console.error("🔴 Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("🔴 Unexpected error:", error);
    process.exit(1);
  });
