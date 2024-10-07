// scripts/interact.js

// ---------------------------------------------
// 1. Importing Dependencies
// ---------------------------------------------

// Correctly import `ethers` from Hardhat to ensure compatibility
const { ethers } = require("hardhat");

// ---------------------------------------------
// 2. Configuration Constants
// ---------------------------------------------

// Replace with the correct ICHIVault contract address
const ICHIVAULT_ADDRESS = '0x1d451e2F5C106A26C0aAe50c7aF1920F21A15330';

// **IMPORTANT:** Replace this with the correct `wBERA` token contract address on `berachain_bartio`.
// **Do not** use your wallet address here.
const ERC20_TOKEN_ADDRESS = '0x7507c1dc16935B82698e4C63f2746A2fCf994dF8'; // Correct `wBERA` token address

// ICHIVault ABI (Include only the necessary functions)
const ICHIVAULT_ABI = [
  "function deposit(uint256 deposit0, uint256 deposit1, address to) external returns (uint256 shares)",
  "function getTotalAmounts() external view returns (uint256 total0, uint256 total1)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function allowToken0() external view returns (bool)",
  "function allowToken1() external view returns (bool)"
];

// Minimal ERC20 ABI for required functions
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// ---------------------------------------------
// 3. Utility Functions
// ---------------------------------------------

/**
 * Formats a BigNumber amount to a human-readable string based on decimals.
 * @param {BigNumber} amount - The amount to format.
 * @param {number} decimals - The number of decimals the token uses.
 * @returns {string} - The formatted amount as a string.
 */
const formatAmount = (amount, decimals) => {
  return ethers.utils.formatUnits(amount, decimals);
};

// ---------------------------------------------
// 4. Main Execution Function
// ---------------------------------------------

async function main() {
  try {
    // ---------------------------------------------
    // 4.1. Verify `ethers.utils` is Defined
    // ---------------------------------------------

    console.log("🔍 ethers version:", ethers.version);
    console.log("🔍 ethers.utils is defined:", ethers.utils !== undefined);
    if (!ethers.utils) {
      throw new Error("ethers.utils is undefined. Check your import statements.");
    }

    // ---------------------------------------------
    // 4.2. Retrieve Signer
    // ---------------------------------------------

    // Get the list of signers (accounts)
    const [signer] = await ethers.getSigners();

    if (!signer) {
      console.error("🔴 No signers available. Ensure your PRIVATE_KEY is correctly set in the .env file.");
      return;
    }

    console.log("✅ Interacting with contracts using account:", signer.address);

    // ---------------------------------------------
    // 4.3. Instantiate Contracts
    // ---------------------------------------------

    // Instantiate the ICHIVault contract
    const ichiVault = new ethers.Contract(ICHIVAULT_ADDRESS, ICHIVAULT_ABI, signer);

    // ---------------------------------------------
    // 4.4. Fetch Token Addresses
    // ---------------------------------------------

    const token0Address = await ichiVault.token0();
    const token1Address = await ichiVault.token1();

    console.log("🔸 Token0 Address:", token0Address);
    console.log("🔸 Token1 Address:", token1Address);

    // ---------------------------------------------
    // 4.5. Check if Tokens are Allowed for Deposit
    // ---------------------------------------------

    const allowToken0 = await ichiVault.allowToken0();
    const allowToken1 = await ichiVault.allowToken1();

    console.log("🔸 Allow Token0:", allowToken0);
    console.log("🔸 Allow Token1:", allowToken1);

    // ---------------------------------------------
    // 4.6. Determine Which Token to Deposit
    // ---------------------------------------------

    // Initialize deposit amounts
    let deposit0 = ethers.constants.Zero; // Amount for token0
    let deposit1 = ethers.constants.Zero; // Amount for token1

    // Flag to check if any deposit is made
    let isDepositMade = false;

    // Determine which token to deposit based on allowance and token address
    if (allowToken1 && token1Address.toLowerCase() === ERC20_TOKEN_ADDRESS.toLowerCase()) {
      console.log("💼 Proceeding to deposit token1.");

      // Instantiate token1 contract
      const erc20Token1 = new ethers.Contract(token1Address, ERC20_ABI, signer);

      // Fetch token1 symbol and decimals
      const token1Symbol = await erc20Token1.symbol();
      const decimals1 = await erc20Token1.decimals();

      // Fetch wallet balance for token1
      const walletBalance1 = await erc20Token1.balanceOf(signer.address);
      deposit1 = walletBalance1.mul(10).div(100); // 10% of wallet balance

      console.log(`🔸 Wallet Balance for ${token1Symbol}:`, formatAmount(walletBalance1, decimals1));
      console.log(`🔸 Seeking approval for ${token1Symbol}:`, formatAmount(deposit1, decimals1), "at address:", token1Address);

      // Approve ICHIVault to spend token1
      if (deposit1.gt(0)) {
        const approveTx1 = await erc20Token1.approve(ICHIVAULT_ADDRESS, deposit1);
        console.log(`⏳ Waiting for approval transaction for ${token1Symbol} to be mined...`);
        const approveReceipt1 = await approveTx1.wait();

        if (approveReceipt1.status !== 1) {
          console.error(`🔴 Approval transaction for ${token1Symbol} failed.`);
          return;
        }

        console.log(`✅ Approval transaction for ${token1Symbol} successful!`);
        console.log(`🔸 Depositing ${formatAmount(deposit1, decimals1)} ${token1Symbol} to ICHIVAULT_ADDRESS`);
        isDepositMade = true;
      } else {
        console.error(`🔴 Insufficient balance to deposit ${token1Symbol}.`);
        return;
      }
    }

    // Check and deposit token0 if allowed (if needed)
    if (allowToken0 && token0Address.toLowerCase() === ERC20_TOKEN_ADDRESS.toLowerCase()) {
      console.log("💼 Proceeding to deposit token0.");

      // Instantiate token0 contract
      const erc20Token0 = new ethers.Contract(token0Address, ERC20_ABI, signer);

      // Fetch token0 symbol and decimals
      const token0Symbol = await erc20Token0.symbol();
      const decimals0 = await erc20Token0.decimals();

      // Fetch wallet balance for token0
      const walletBalance0 = await erc20Token0.balanceOf(signer.address);
      deposit0 = walletBalance0.mul(10).div(100); // 10% of wallet balance

      console.log(`🔸 Wallet Balance for ${token0Symbol}:`, formatAmount(walletBalance0, decimals0));
      console.log(`🔸 Seeking approval for ${token0Symbol}:`, formatAmount(deposit0, decimals0), "at address:", token0Address);

      // Approve ICHIVault to spend token0
      if (deposit0.gt(0)) {
        const approveTx0 = await erc20Token0.approve(ICHIVAULT_ADDRESS, deposit0);
        console.log(`⏳ Waiting for approval transaction for ${token0Symbol} to be mined...`);
        const approveReceipt0 = await approveTx0.wait();

        if (approveReceipt0.status !== 1) {
          console.error(`🔴 Approval transaction for ${token0Symbol} failed.`);
          return;
        }

        console.log(`✅ Approval transaction for ${token0Symbol} successful!`);
        console.log(`🔸 Depositing ${formatAmount(deposit0, decimals0)} ${token0Symbol} to ICHIVAULT_ADDRESS`);
        isDepositMade = true;
      } else {
        console.error(`🔴 Insufficient balance to deposit ${token0Symbol}.`);
        return;
      }
    } else {
      console.log("🔸 Token0 is not allowed for deposit or does not match the specified ERC20 token address.");
    }

    // ---------------------------------------------
    // 4.7. Handle Case Where No Token is Allowed for Deposit
    // ---------------------------------------------

    if (!isDepositMade) {
      console.error("🔴 Neither token0 nor token1 is allowed for deposit or does not match the specified ERC20 token address.");
      return;
    }

    // ---------------------------------------------
    // 4.8. Perform Deposit Operation
    // ---------------------------------------------

    try {
      console.log("💰 Initiating deposit into the vault...");
      const depositTx = await ichiVault.deposit(deposit0, deposit1, signer.address);
      console.log("⏳ Waiting for deposit transaction to be mined...");
      const depositReceipt = await depositTx.wait();

      if (depositReceipt.status !== 1) {
        console.error("🔴 Deposit transaction failed.");
        return;
      }

      console.log("✅ Deposit transaction successful! Hash:", depositReceipt.transactionHash);
    } catch (error) {
      console.error("🔴 Error during deposit:", error.message);
      return;
    }

    // ---------------------------------------------
    // 4.9. Fetch and Display Updated Total Amounts in the Vault
    // ---------------------------------------------

    try {
      console.log("🔍 Fetching updated total amounts in the vault...");
      const updatedTotalAmounts = await ichiVault.getTotalAmounts();
      const updatedTotal0 = updatedTotalAmounts.total0;
      const updatedTotal1 = updatedTotalAmounts.total1;

      console.log("🔸 Raw response from getTotalAmounts() after deposit:", updatedTotalAmounts);

      // Instantiate token0 and token1 again to get symbols and decimals
      const erc20Token0 = new ethers.Contract(token0Address, ERC20_ABI, signer);
      const erc20Token1 = new ethers.Contract(token1Address, ERC20_ABI, signer);

      const token0Symbol = await erc20Token0.symbol();
      const decimals0 = await erc20Token0.decimals();

      const token1Symbol = await erc20Token1.symbol();
      const decimals1 = await erc20Token1.decimals();

      // Format the updated total amounts
      const formattedUpdatedTotal0 = formatAmount(updatedTotal0, decimals0);
      const formattedUpdatedTotal1 = formatAmount(updatedTotal1, decimals1);

      console.log("📊 Updated total amounts in vault:");
      console.log(`   - ${token0Symbol}: ${formattedUpdatedTotal0}`);
      console.log(`   - ${token1Symbol}: ${formattedUpdatedTotal1}`);
    } catch (error) {
      console.error("🔴 Error fetching updated total amounts:", error.message);
    }
  } catch (error) {
    console.error("🔴 An unexpected error occurred:", error);
  }
}

// ---------------------------------------------
// 5. Execute the Main Function
// ---------------------------------------------

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("🔴 Unexpected error:", error);
    process.exit(1);
  });
