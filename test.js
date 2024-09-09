const assert = require('assert');
const { Blockchain } = require('./src/simulated-blockchain');
const SIP = require('./src/contracts/SIP');
const HONEY = require('./src/contracts/HONEY');
const HoneySipPool = require('./src/contracts/HoneySipPool');
const AquaBeraVault = require('./src/contracts/AquaBeraVault');
const JUG = require('./src/contracts/JUG');
const BoopTheSnoot = require('./src/contracts/BoopTheSnoot');
const ERC20Token = require('./src/contracts/ERC20Token');

// Helper function to format amounts
function formatAmount(amount, decimals = 2) {
    return Number(amount).toFixed(decimals);
}

// Test Simulated Blockchain
function testBlockchain() {
  console.log('Testing Simulated Blockchain...');
  const blockchain = new Blockchain();
  
  assert(blockchain.chain.length === 1, 'Blockchain should start with genesis block');
  assert(blockchain.isChainValid(), 'Initial blockchain should be valid');
  
  blockchain.addTransaction({ fromAddress: 'address1', toAddress: 'address2', amount: 100 });
  blockchain.minePendingTransactions('minerAddress');
  
  assert(blockchain.chain.length === 2, 'Blockchain should have two blocks after mining');
  assert(blockchain.isChainValid(), 'Blockchain should remain valid after mining');
  assert(blockchain.getBalanceOfAddress('minerAddress') === 100, 'Miner should receive reward');
  
  console.log('Blockchain tests passed!');
}

// Test SIP Token Contract
function testSIPContract(sipContract) {
    console.log('Testing SIP Token Contract...');
    console.log('Checking initial treasury balance...');
    const initialBalance = sipContract.balanceOf('0x0');
    console.log(`Initial treasury balance: ${formatAmount(initialBalance)}`);
    assert(initialBalance === 75000000, 'Initial balance should be 75,000,000');

    console.log('Performing transfer...');
    sipContract.transfer('0x0', 'address1', 1000);
    
    console.log('Checking balances after transfer...');
    assert(sipContract.balanceOf('address1') === 1000, 'Address1 balance should be 1000');
    assert(sipContract.balanceOf('0x0') === 74999000, 'Treasury balance should be 74,999,000');
    
    console.log('Minting new tokens...');
    sipContract.mint('address2', 500, '0x0');
    
    console.log('Checking balances after minting...');
    assert(sipContract.balanceOf('address2') === 500, 'Address2 balance should be 500');
    assert(sipContract.totalSupply === 75000500, 'Total supply should increase after minting');
    
    console.log('Burning tokens...');
    sipContract.burn('address1', 200, 'address1');
    assert(sipContract.balanceOf('address1') == 800, "Address1 balance should be 800 after burning");

    console.log('Checking balances after burning...');
    assert(sipContract.balanceOf('address1') == 800, "Address1 balance should be 800");
    assert(sipContract.balanceOf('address2') == 500, "Address2 balance should still be 500");
    assert(sipContract.totalSupply == 75000300, "Total supply should be 75000300 after burning");
    
    console.log('SIP Token Contract tests passed!');
}

function testHONEYContract(honeyContract) {
    console.log('Testing HONEY Token Contract...');
    console.log('Checking initial treasury balance...');
    assert(honeyContract.balanceOf('0x0') === 1000000, 'Initial treasury balance should be 1,000,000');
    
    console.log('Performing HONEY transfer...');
    honeyContract.transfer('0x0', 'address1', 1000);
    
    console.log('Checking balances after HONEY transfer...');
    assert(honeyContract.balanceOf('address1') === 1000, 'HONEY transfer should work correctly');
    assert(honeyContract.balanceOf('0x0') === 999000, 'Treasury HONEY balance should decrease after transfer');
    
    console.log('Minting new HONEY tokens...');
    honeyContract.mint('address2', 500, '0x0');
    
    console.log('Checking balances after HONEY minting...');
    assert(honeyContract.balanceOf('address2') === 500, 'HONEY minting should work correctly');
    assert(honeyContract.totalSupply === 1000500, 'Total HONEY supply should increase after minting');
    
    console.log('Burning HONEY tokens...');
    honeyContract.burn('address1', 200, 'address1');
    
    console.log('Checking balances after HONEY burning...');
    assert(honeyContract.balanceOf('address1') === 800, 'HONEY burning should work correctly');
    assert(honeyContract.totalSupply === 1000300, 'Total HONEY supply should decrease after burning');
    
    console.log('HONEY Token Contract tests passed!');
}

function testHoneySipPool(sipToken, honeyToken) {
    console.log('Testing HoneySipPool Contract...');
    const honeySipPool = new HoneySipPool(sipToken, honeyToken);

    // Transfer initial tokens to user1
    sipToken.transfer('0x0', 'user1', 10000);
    honeyToken.transfer('0x0', 'user1', 10000);

    console.log('Adding initial liquidity...');
    sipToken.approve('user1', honeySipPool.address, 10000);
    honeyToken.approve('user1', honeySipPool.address, 10000);

    const lpTokens = honeySipPool.addLiquidity('user1', 10000, 10000);
    console.log(`User1 received ${formatAmount(lpTokens)} LP tokens`);

    const user1LPBalance = honeySipPool.lpToken.balanceOf('user1');
    console.log(`User1 LP token balance: ${formatAmount(user1LPBalance)}`);
    assert(user1LPBalance === lpTokens, 'LP token balance should match minted amount');

    // Test removing liquidity
    console.log('Removing half of the liquidity...');
    const { sipAmount, honeyAmount } = honeySipPool.removeLiquidity('user1', lpTokens / 2);
    console.log(`User1 received ${formatAmount(sipAmount)} SIP and ${formatAmount(honeyAmount)} HONEY`);

    // Check updated LP token balance
    const updatedUser1Balance = honeySipPool.lpToken.balanceOf('user1');
    console.log(`User1 updated LP token balance: ${formatAmount(updatedUser1Balance)}`);
    assert(updatedUser1Balance === lpTokens / 2, 'LP token balance should be halved');

    // Check individual token balances
    const user1SIPBalance = sipToken.balanceOf('user1');
    const user1HONEYBalance = honeyToken.balanceOf('user1');
    console.log(`User1 SIP balance: ${formatAmount(user1SIPBalance)}`);
    console.log(`User1 HONEY balance: ${formatAmount(user1HONEYBalance)}`);

    console.log('HoneySipPool tests passed!');
}

function testAquaBeraVault(sipToken, honeyToken, honeySipPool) {
    console.log('Testing AquaBera Vault...');
    const vault = new AquaBeraVault(sipToken, honeyToken, honeySipPool);

    // Setup: Give user some SIP tokens and approve vault
    sipToken.transfer('0x0', 'user1', 10000);
    const initialBalance = sipToken.balanceOf('user1');
    console.log(`Initial user SIP balance: ${formatAmount(initialBalance)}`);

    console.log('User depositing SIP into the vault...');
    const depositAmount = 1000;
    sipToken.approve('user1', vault.address, depositAmount);
    
    const abvLpReceived = vault.deposit('user1', depositAmount);
    console.log(`Received ${formatAmount(abvLpReceived)} AquaBeraVault LP tokens`);

    const userVaultBalance = vault.lpToken.balanceOf('user1');
    console.log(`User AquaBeraVault LP balance: ${formatAmount(userVaultBalance)}`);
    assert(userVaultBalance === abvLpReceived, 'Deposit should match user AquaBeraVault LP balance');

    console.log('User withdrawing from the vault...');
    const withdrawAmount = Math.floor(abvLpReceived / 2);
    const { sipAmount, honeyAmount } = vault.withdraw('user1', withdrawAmount);
    console.log(`Withdrew ${formatAmount(sipAmount)} SIP and ${formatAmount(honeyAmount)} HONEY`);

    const finalUserVaultBalance = vault.lpToken.balanceOf('user1');
    console.log(`Final user AquaBeraVault LP balance: ${formatAmount(finalUserVaultBalance)}`);
    assert(finalUserVaultBalance === abvLpReceived - withdrawAmount, 'Withdrawal should decrease AquaBeraVault LP balance');

    const finalUserSipBalance = sipToken.balanceOf('user1');
    const finalUserHoneyBalance = honeyToken.balanceOf('user1');
    console.log(`Final user SIP balance: ${formatAmount(finalUserSipBalance)}`);
    console.log(`Final user HONEY balance: ${formatAmount(finalUserHoneyBalance)}`);

    console.log('AquaBera Vault tests passed!');
}

function testJUGContract(aquaBeraVault, sipToken, honeyToken) {
    console.log('Testing JUG Contract...');
    const jug = new JUG(aquaBeraVault, 1000, 2000, formatAmount); // Initial block 1000, maturity block 2000
    
    // Setup: Give user some SIP tokens and deposit into AquaBeraVault
    sipToken.mint('user1', 10000, '0x0');
    sipToken.approve('user1', aquaBeraVault.address, 10000);
    const abvLpReceived = aquaBeraVault.deposit('user1', 10000);
    
    console.log(`User1 received ${formatAmount(abvLpReceived)} AquaBeraVault LP tokens`);
    
    // Mint some JUG tokens for testing
    jug.mint('user1', 1000);
    
    // Add LP tokens to JUG contract (simulating accumulation)
    jug.updateLpTokens(1250, 500); // Add 500 LP tokens at block 1250
    
    // Test redeem
    console.log('Testing JUG redeem...');
    const currentBlock = 1500; // 50% maturity
    const initialAbvLpBalance = aquaBeraVault.lpToken.balanceOf('user1');
    const lpTokensReceived = jug.redeem('user1', 500, currentBlock);
    console.log(`User1 redeemed ${formatAmount(500)} JUG tokens and received ${formatAmount(lpTokensReceived)} AquaBeraVault LP tokens`);
    
    assert(jug.balanceOf('user1') === 500, 'User should have 500 JUG tokens left');
    assert(aquaBeraVault.lpToken.balanceOf('user1') > initialAbvLpBalance, 'User should have received additional AquaBeraVault LP tokens');

    console.log('JUG Contract tests passed!');
}

function testBoopTheSnoot(aquaBeraVault, jugToken) {
    console.log('Testing BoopTheSnoot Contract...');
    const initialBlockNumber = 100000000;
    const boopTheSnoot = new BoopTheSnoot(initialBlockNumber, 1000000, 150, jugToken, 1, 5000);

    // Simulate 150 players depositing random amounts (without logging)
    for (let i = 1; i <= 150; i++) {
        const depositAmount = Math.floor(Math.random() * 7);
        boopTheSnoot.deposit(depositAmount, { from: `player${i}` });
    }

    // Run for 5000 blocks (without logging individual block wins)
    for (let block = 0; block < 5000; block++) {
        boopTheSnoot.distributeRewards();
    }

    // Use the simplified logging function
    logSimplifiedResults(boopTheSnoot);

    console.log('BoopTheSnoot test completed!');
}

function logSimplifiedResults(boopTheSnoot) {
    console.log("\nSimplified BoopTheSnoot Results:");
    console.log("Rank  | Deposit | Total Rewards | Wins | Avg Reward | Win Rate");
    console.log("------|---------|---------------|------|------------|----------");

    const totalBlocks = boopTheSnoot.getTotalBlocks();
    const playerRanks = boopTheSnoot.getRankings();

    let primeRanksStats = { totalRewards: 0, totalWins: 0, count: 0 };
    let compositeRanksStats = { totalRewards: 0, totalWins: 0, count: 0 };

    playerRanks.forEach((player, index) => {
        const rank = index + 1;
        const stats = boopTheSnoot.getPlayerStats(player);
        const winRate = (stats.rewardCount / totalBlocks * 100).toFixed(2);
        const avgReward = stats.rewardCount > 0 ? (stats.totalRewardsReceived / stats.rewardCount).toFixed(2) : '0.00';

        // Update prime/composite stats
        if (isPrime(rank)) {
            primeRanksStats.totalRewards += stats.totalRewardsReceived;
            primeRanksStats.totalWins += stats.rewardCount;
            primeRanksStats.count++;
        } else {
            compositeRanksStats.totalRewards += stats.totalRewardsReceived;
            compositeRanksStats.totalWins += stats.rewardCount;
            compositeRanksStats.count++;
        }

        // Log only top 5 and bottom 3 ranks
        if (rank <= 5 || rank > 147) {
            console.log(
                `${rank.toString().padStart(4)} | ` +
                `${stats.lpTokens.toFixed(2).padStart(7)} | ` +
                `${stats.totalRewardsReceived.toFixed(2).padStart(13)} | ` +
                `${stats.rewardCount.toString().padStart(4)} | ` +
                `${avgReward.padStart(10)} | ` +
                `${winRate.padStart(8)}%`
            );
        }
    });

    console.log("\nRank Summaries:");
    console.log(`Prime Ranks - Avg Rewards: ${(primeRanksStats.totalRewards / primeRanksStats.count).toFixed(2)}, Avg Wins: ${(primeRanksStats.totalWins / primeRanksStats.count).toFixed(2)}, Avg Win Rate: ${(primeRanksStats.totalWins / primeRanksStats.count / totalBlocks * 100).toFixed(2)}%`);
    console.log(`Composite Ranks - Avg Rewards: ${(compositeRanksStats.totalRewards / compositeRanksStats.count).toFixed(2)}, Avg Wins: ${(compositeRanksStats.totalWins / compositeRanksStats.count).toFixed(2)}, Avg Win Rate: ${(compositeRanksStats.totalWins / compositeRanksStats.count / totalBlocks * 100).toFixed(2)}%`);

    console.log("\nGame Statistics:");
    console.log(`Total Blocks: ${totalBlocks}, Final Reward Pool: ${boopTheSnoot.getTotalRewardPool().toFixed(2)}, Total Rewards Distributed: ${boopTheSnoot.getTotalRewardsDistributed().toFixed(2)}`);

    // Add this new section to show the 5 best ranks in the bottom 30
    console.log("\n5 Best Ranks in Bottom 30:");
    console.log("Rank | Player | Total Rewards | Wins | Avg Reward | Win Rate");
    console.log("-----|--------|---------------|------|------------|----------");
    
    const bottomThirty = playerRanks.slice(-30);
    bottomThirty
        .map((player, index) => ({
            rank: index + 1,
            player,
            ...boopTheSnoot.getPlayerStats(player)
        }))
        .sort((a, b) => b.totalRewardsReceived - a.totalRewardsReceived)
        .slice(0, 5)
        .forEach(printPlayerStats);

    function printPlayerStats(stats) {
        const winRate = (stats.rewardCount / totalBlocks * 100).toFixed(2);
        const avgReward = stats.rewardCount > 0 ? (stats.totalRewardsReceived / stats.rewardCount).toFixed(2) : '0.00';
        console.log(`${stats.rank.toString().padStart(4)} | ${stats.player.padEnd(6)} | ${stats.totalRewardsReceived.toFixed(2).padStart(13)} | ${stats.rewardCount.toString().padStart(4)} | ${avgReward.padStart(10)} | ${winRate.padStart(8)}%`);
    }
}

function isPrime(num) {
    for (let i = 2, sqrt = Math.sqrt(num); i <= sqrt; i++)
        if (num % i === 0) return false;
    return num > 1;
}

// Run all tests
function runTests() {
  // Create instances of all required contracts
  const sipToken = new SIP(75000000, formatAmount);  // Explicitly set initial supply
  const honeyToken = new HONEY(1000000, formatAmount);
  const honeySipPool = new HoneySipPool(sipToken, honeyToken);
  const aquaBeraVault = new AquaBeraVault(sipToken, honeyToken, honeySipPool);
  
  const jugToken = new JUG(aquaBeraVault, 1000, 2000, formatAmount); // Initial block 1000, maturity block 2000

  const testResults = [
    testBlockchain(),
    testSIPContract(sipToken),
    testHONEYContract(honeyToken),
    testHoneySipPool(sipToken, honeyToken),
    testAquaBeraVault(sipToken, honeyToken, honeySipPool),
    testJUGContract(aquaBeraVault, sipToken, honeyToken),
    testBoopTheSnoot(aquaBeraVault, jugToken),
  ];

  const allTestsPassed = testResults.every(result => result !== false);

  if (allTestsPassed) {
    console.log('All tests passed successfully!');
  } else {
    console.log('Some tests failed. Please review the output above for details.');
  }
}

runTests();