import BoopTheSnoot from '../contracts/BoopTheSnoot';

class GameState {
    constructor() {
        this.boopTheSnoot = new BoopTheSnoot(100000000, 1000000, 3000, null, 1, 5000);
        this.players = [];
        this.currentPlayerIndex = 0;
        this.initializePlayers(150);
    }

    initializePlayers(count) {
        for (let i = 1; i <= count; i++) {
            const playerId = `player${i}`;
            this.addPlayer(playerId);
            
            // Random deposit between 1 and 100
            const initialDeposit = Math.floor(Math.random() * 100) + 1;
            this.boopTheSnoot.deposit(initialDeposit, { from: playerId });
        }
        console.log(`Initialized ${count} players with random deposits`);
    }

    addPlayer(playerId) {
        if (this.players.length < 3000) {
            this.players.push(playerId);
        } else {
            console.warn("Maximum number of players (3000) reached. Cannot add more players.");
        }
    }

    switchPlayer(playerId) {
        const index = this.players.indexOf(playerId);
        if (index !== -1) {
            this.currentPlayerIndex = index;
        }
    }

    get currentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    deposit(amount) {
        try {
            this.boopTheSnoot.deposit(amount, { from: this.currentPlayer });
            return { success: true, newBalance: this.boopTheSnoot.getPlayerStats(this.currentPlayer).lpTokens };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    withdraw(amount) {
        try {
            const withdrawnAmount = this.boopTheSnoot.withdraw(amount, { from: this.currentPlayer });
            return { success: true, newBalance: this.boopTheSnoot.getPlayerStats(this.currentPlayer).lpTokens, withdrawnAmount };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    getUserBalance() {
        return this.boopTheSnoot.getPlayerStatsWithRewards(this.currentPlayer).lpTokens;
    }

    getCurrentRank() {
        return this.boopTheSnoot.getRankings().indexOf(this.currentPlayer) + 1;
    }

    getUnclaimedRewards() {
        return this.boopTheSnoot.getRewardBalance(this.currentPlayer);
    }

    claimRewards() {
        const unclaimedRewards = this.getUnclaimedRewards();
        if (unclaimedRewards > 0) {
            this.boopTheSnoot.playerData[this.currentPlayer].rewardBalance = 0;
            return { success: true, claimedAmount: unclaimedRewards };
        }
        return { success: false, error: "No rewards to claim" };
    }

    simulateBlock() {
        this.simulateAllPlayers();
        this.boopTheSnoot.distributeRewardsWithDetails(this.boopTheSnoot.getCurrentBlock());
    }

    getLeaderboard() {
        const rankings = this.boopTheSnoot.getRankings();
        return rankings.slice(0, 150).map((player) => ({
            address: player,
            balance: this.boopTheSnoot.getPlayerStats(player).lpTokens,
            totalRewards: this.boopTheSnoot.getPlayerStats(player).totalRewardsReceived
        }));
    }

    predictEarnings(rank) {
        const blocksInTenMinutes = Math.floor(600 / this.boopTheSnoot.blockCreationSpeed);
        return this.boopTheSnoot.predictEarnings(rank, blocksInTenMinutes);
    }

    simulateAllPlayers() {
        this.players.forEach(player => {
            if (!this.boopTheSnoot.getPlayerStats(player).lpTokens) {
                // Initialize new player with some tokens
                this.boopTheSnoot.deposit(10, { from: player });
            }
            this.switchPlayer(player);
            
            // Random actions are now commented out
        
            if (Math.random() < 0.01) {  // 1% chance of action
                const currentBalance = this.boopTheSnoot.getPlayerStats(player).lpTokens;
                const changePercentage = Math.random() * 0.15 - 0.05;  // Random between -5% to +10%
                const changeAmount = Math.floor(currentBalance * changePercentage);
                
                if (changeAmount > 0) {
                    this.deposit(changeAmount);
                } else if (changeAmount < 0) {
                    this.withdraw(Math.abs(changeAmount));
                }
            }
        
        });

        // Increment the block number and distribute rewards
        this.boopTheSnoot.distributeRewardsWithDetails(this.boopTheSnoot.getCurrentBlock() + 1);
    }

    initializePlayers() {
        for (let i = 1; i <= 150; i++) {
            const playerId = `player${i}`;
            this.addPlayer(playerId);
            
            // Random deposit between 1 and 100
            const initialDeposit = Math.floor(Math.random() * 100) + 1;
            this.boopTheSnoot.deposit(initialDeposit, { from: playerId });
        }
        console.log("Initialized 150 players with random deposits");
    }

    getTotalPlayers() {
        return this.boopTheSnoot.players.length;
    }

    getAverageReward() {
        const totalRewards = this.players.reduce((sum, player) => {
            return sum + this.boopTheSnoot.getRewardBalance(player);
        }, 0);
        return this.players.length > 0 ? totalRewards / this.players.length : 0;
    }

    getDepositAmountForRank(rank) {
        // Implement the logic to calculate the deposit amount for a given rank
        // This is a placeholder implementation, adjust according to your game rules
        return rank * 100; // Example: each rank requires 100 more SIP than the previous
    }
}

export const gameState = new GameState();