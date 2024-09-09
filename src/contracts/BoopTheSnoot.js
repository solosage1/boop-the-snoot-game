class BoopTheSnoot {
    constructor(initialBlockNumber, initialRewardPool, maxPlayers, jugToken, blockCreationSpeed, totalBlocks) {
        this.currentBlockNumber = initialBlockNumber;
        this.rewardPool = initialRewardPool;
        this.maxPlayers = maxPlayers;
        this.jugToken = jugToken;
        this.blockCreationSpeed = blockCreationSpeed;
        this.totalBlocks = totalBlocks;
        this.playerData = {};
        this.players = [];
        this.playerRanks = [];
        this.totalRewardsDistributed = 0;
        this.rewardRate = this.calculateRewardRate();
        console.log(`Initial reward rate: ${this.rewardRate}`);
        this.rank97WinningBlocks = [];
        this.rank101WinningBlocks = [];
    }

    calculateRewardRate() {
        if (this.totalBlocks <= 0) {
            console.error("Total blocks must be greater than zero");
            return 0;
        }
        if (this.rewardPool <= 0) {
            console.error("Reward pool must be greater than zero");
            return 0;
        }
        const rate = this.rewardPool / this.totalBlocks;
        console.log(`Calculated reward rate: ${rate}, RewardPool: ${this.rewardPool}, TotalBlocks: ${this.totalBlocks}`);
        return rate;
    }

    setOwner(newOwner) {
        if (this.owner === null) {
            this.owner = newOwner;
            console.log(`Owner set to ${newOwner}`);
        } else {
            throw new Error("Owner can only be set once");
        }
    }

    onlyOwner(sender) {
        if (sender !== this.owner) {
            throw new Error("Only owner can perform this action");
        }
    }

    setRewardRate(newRate, { from }) {
        this.onlyOwner(from);
        this.rewardRate = newRate;
        console.log(`Reward rate updated to ${newRate}`);
    }

    depositRewards(amount, options = {}) {
        const from = options.from || this.msg.sender;
        if (!from) {
            throw new Error("Sender address is required");
        }
        this.jugToken.transferFrom(from, this, amount);
        this.rewardPool += amount;
        console.log(`${amount} JUG tokens deposited to reward pool by ${from}`);
    }

    deposit(amount, { from }) {
        if (this.players.length >= this.maxPlayers) {
            throw new Error("Maximum number of players reached");
        }

        if (!this.playerData[from]) {
            this.playerData[from] = {
                lpTokens: 0,
                rewardBalance: 0,
                lastUpdateBlock: this.currentBlockNumber,
                rewardCount: 0,
                totalRewardsReceived: 0
            };
            this.players.push(from);
        }

        this.playerData[from].lpTokens += amount;
        this.updateRanks();
    }

    withdraw(amount, { from }) {
        this.distributeRewards();
        if (!this.playerData[from] || this.playerData[from].lpTokens < amount) {
            throw new Error("Insufficient LP tokens");
        }
        this.playerData[from].lpTokens -= amount;
        if (this.playerData[from].lpTokens === 0) {
            this.players = this.players.filter(p => p !== from);
        }
        this.updateRanks();
        this.claimRewards({ from });
        console.log(`${from} withdrew ${amount} LP tokens`);
        return amount; // Return the withdrawn amount
    }

    updateRanks() {
        this.playerRanks = this.players.slice().sort((a, b) => {
            const diff = this.playerData[b].lpTokens - this.playerData[a].lpTokens;
            return diff !== 0 ? diff : this.players.indexOf(a) - this.players.indexOf(b);
        });
    }

    distributeRewards() {
        const currentBlock = this.currentBlockNumber;
        const shortenedBlockNumber = this.shortenBlockNumber(currentBlock);
        let reward = Math.min(this.rewardRate, this.rewardPool);
        
        if (reward <= 0 || this.playerRanks.length === 0) {
            this.currentBlockNumber++;
            return;
        }

        this.rewardPool -= reward;
        this.totalRewardsDistributed += reward;

        let winners = this.determineWinners(shortenedBlockNumber);

        if (winners.length > 0) {
            const rewardPerWinner = reward / winners.length;
            winners.forEach(winner => {
                this.playerData[winner].rewardBalance += rewardPerWinner;
                this.playerData[winner].rewardCount++;
                this.playerData[winner].totalRewardsReceived += rewardPerWinner;

                // Track winning blocks for ranks 97 and 101
                const winnerRank = this.playerRanks.indexOf(winner) + 1;
                if (winnerRank === 97) {
                    this.rank97WinningBlocks.push({ block: currentBlock, shortened: shortenedBlockNumber });
                } else if (winnerRank === 101) {
                    this.rank101WinningBlocks.push({ block: currentBlock, shortened: shortenedBlockNumber });
                }
            });
        }
        
        this.currentBlockNumber++;
    }

    determineWinners(shortenedBlockNumber) {
        return this.playerRanks.filter((player, index) => {
            const playerNumber = index + 1;
            if (playerNumber === 1) {
                // Rank 1 only wins on odd shortened block numbers
                return shortenedBlockNumber % 2 !== 0;
            }
            return shortenedBlockNumber % playerNumber === 0 || playerNumber % shortenedBlockNumber === 0;
        });
    }

    shortenBlockNumber(blockNumber) {
        const effectivePlayerCount = Math.min(this.playerRanks.length, this.maxPlayers);
        if (effectivePlayerCount === 0) return 2;  // Changed from 0 to 2

        // Remove trailing zeros
        let trimmedNumber = blockNumber;
        while (trimmedNumber % 10 === 0 && trimmedNumber > 0) {
            trimmedNumber = Math.floor(trimmedNumber / 10);
        }

        // If all digits were zeros, return 2
        if (trimmedNumber === 0) return 2;

        let shortenedNumber = trimmedNumber;
        while (shortenedNumber >= effectivePlayerCount) {
            shortenedNumber = parseInt(shortenedNumber.toString().slice(1));
        }

        // If we've removed all digits or the result is 0, use the trimmed number modulo effectivePlayerCount
        if (shortenedNumber === 0) {
            shortenedNumber = trimmedNumber % effectivePlayerCount;
            // If the result is still 0, return 2
            if (shortenedNumber === 0) return 2;
        }

        // If the final result is 1, return 3
        if (shortenedNumber === 1) return 3;

        return shortenedNumber;
    }

    distributeBlockReward(shortenedBlockNumber) {
        let reward = Math.min(this.rewardRate, this.rewardPool);
        if (reward > 0 && this.playerRanks.length > 0) {
            this.rewardPool -= reward;
            this.totalRewardsDistributed += reward;

            let winners = this.determineWinners(shortenedBlockNumber);
            if (winners.length > 0) {
                const rewardPerWinner = reward / winners.length;
                winners.forEach(winner => {
                    this.playerData[winner].rewardBalance += rewardPerWinner;
                    this.playerData[winner].rewardCount++;
                    this.playerData[winner].totalRewardsReceived += rewardPerWinner;
                });
            }
        }
    }

    claimRewards({ from }) {
        this.distributeRewards();
        const reward = this.playerData[from].rewardBalance;
        this.playerData[from].rewardBalance = 0;
        this.jugToken.transfer(from, reward);
        console.log(`${from} claimed ${reward} JUG tokens`);
    }

    getPlayerStats(player) {
        return this.playerData[player] || { lpTokens: 0, rewardBalance: 0, lastUpdateBlock: this.currentBlockNumber, rewardCount: 0, totalRewardsReceived: 0 };
    }

    getPlayerStatsWithRewards(player) {
        const stats = this.getPlayerStats(player);
        return {
            lpTokens: stats.lpTokens,
            totalRewardsReceived: stats.totalRewardsReceived
        };
    }

    getTotalRewardPool() {
        return this.rewardPool;
    }

    getCurrentBlock() {
        return this.currentBlockNumber;
    }

    getRankings() {
        return this.playerRanks;
    }

    getRewardBalance(player) {
        return this.playerData[player]?.rewardBalance || 0;
    }

    setAquaBeraVault(vault) {
        this.aquaBeraVault = vault;
    }

    isRewardPoolDepleted() {
        return this.rewardPool === 0;
    }

    getTotalRewardsDistributed() {
        return this.totalRewardsDistributed;
    }

    setRewardRate(newRate) {
        this.rewardRate = newRate;
        console.log(`Reward rate updated to ${newRate}`);
    }

    getRewardRate() {
        return this.rewardRate;
    }

    distributeRewardsWithDetails(currentBlock) {
        const shortenedBlockNumber = this.shortenBlockNumber(currentBlock);
        
        let reward = Math.min(this.rewardRate, this.rewardPool);
        console.log(`Reward for this block: ${reward.toFixed(2)}, Rate: ${this.rewardRate}, Pool: ${this.rewardPool}`);
        
        if (reward > 0 && this.playerRanks.length > 0) {
            this.rewardPool -= reward;
            this.totalRewardsDistributed += reward;

            let winners = this.determineWinners(shortenedBlockNumber);
            console.log(`Number of winners: ${winners.length}`);
            console.log(`Winners: ${winners.join(', ')}`);

            if (winners.length > 0) {
                const rewardPerWinner = reward / winners.length;
                console.log(`Reward per winner: ${rewardPerWinner.toFixed(2)}`);
                winners.forEach(winner => {
                    this.playerData[winner].rewardBalance += rewardPerWinner;
                    this.playerData[winner].rewardCount++;
                    this.playerData[winner].totalRewardsReceived += rewardPerWinner;
                    console.log(`${winner} received ${rewardPerWinner.toFixed(2)} rewards`);
                });
            } else {
                console.log(`No winners for this block`);
            }
        } else {
            console.log(`No rewards distributed for this block`);
        }
        
        this.currentBlockNumber++;
    }

    logDetailedBlockReward(blockNumber) {
        const shortenedBlockNumber = this.shortenBlockNumber(blockNumber);
        const reward = Math.min(this.rewardRate, this.rewardPool);
        const winners = this.determineWinners(shortenedBlockNumber);
        const rewardPerWinner = winners.length > 0 ? reward / winners.length : 0;

        console.log(`\n--- Detailed Block Reward Log for Block ${blockNumber} ---`);
        console.log(`Shortened Block Number: ${shortenedBlockNumber}`);
        console.log(`Total Block Reward: ${reward.toFixed(4)}`);
        console.log(`Number of Players: ${this.players.length}`);
        console.log(`Number of Winners: ${winners.length}`);
        console.log(`Reward per Winner: ${rewardPerWinner.toFixed(4)}`);
        console.log(`Winning Ranks and Rewards:`);

        winners.forEach((winner, index) => {
            const rank = this.playerRanks.indexOf(winner) + 1;
            console.log(`  Rank ${rank}: ${winner} - Reward: ${rewardPerWinner.toFixed(4)}`);
        });

        console.log(`--- End of Block ${blockNumber} Log ---\n`);
    }

    getTotalBlocks() {
        return this.totalBlocks;
    }

    getWinningBlocksForRanks() {
        return {
            rank97: this.rank97WinningBlocks,
            rank101: this.rank101WinningBlocks
        };
    }

    calculateNextBestRank(currentRank, currentBalance) {
        // Implement logic to calculate next best rank
        // This is a placeholder implementation
        const nextRank = currentRank - 1;
        const depositNeeded = (this.playerData[this.playerRanks[nextRank - 1]]?.lpTokens || 0) - currentBalance + 1;
        return { rank: nextRank, depositAmount: depositNeeded };
    }

    calculateBestLowerRank(currentRank, currentBalance) {
        // Implement logic to calculate best lower rank
        // This is a placeholder implementation
        const lowerRank = currentRank + 1;
        const withdrawAmount = currentBalance - (this.playerData[this.playerRanks[lowerRank - 1]]?.lpTokens || 0) - 1;
        return { rank: lowerRank, withdrawAmount: withdrawAmount };
    }

    predictEarnings(rank, timeInMinutes) {
        const startBlock = this.currentBlockNumber;
        const endBlock = startBlock + Math.floor((timeInMinutes * 60) / this.blockCreationSpeed);
        let totalEarnings = 0;
        let winCount = 0;

        for (let block = startBlock; block < endBlock; block++) {
            const shortenedBlockNumber = this.shortenBlockNumber(block);
            if (this.isWinningRank(rank, shortenedBlockNumber)) {
                winCount++;
            }
        }

        // Calculate total earnings based on win count and current reward rate
        totalEarnings = winCount * this.rewardRate;

        // Add some randomness to make predictions slightly different each time
        const randomFactor = 0.9 + Math.random() * 0.2; // Random factor between 0.9 and 1.1
        totalEarnings *= randomFactor;

        return totalEarnings;
    }

    isWinningRank(rank, shortenedBlockNumber) {
        if (rank === 1) {
            // Rank 1 wins on prime-numbered blocks
            return this.isPrime(shortenedBlockNumber);
        } else if (rank === 2) {
            // Rank 2 wins on even-numbered blocks
            return shortenedBlockNumber % 2 === 0;
        } else {
            // Other ranks win if the block number is divisible by the rank
            return shortenedBlockNumber % rank === 0;
        }
    }

    isPrime(num) {
        for (let i = 2, sqrt = Math.sqrt(num); i <= sqrt; i++) {
            if (num % i === 0) return false;
        }
        return num > 1;
    }

    getDepositAmountForRank(targetRank) {
        const rankings = this.getRankings();
        if (targetRank <= 0 || targetRank > rankings.length) {
            return 0;
        }
        const playerAtRank = rankings[targetRank - 1];
        return this.playerData[playerAtRank].lpTokens;
    }
}

module.exports = BoopTheSnoot;