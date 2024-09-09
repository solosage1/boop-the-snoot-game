import { gameState } from './gameState';

export function getUserBalance() {
    return gameState.getUserBalance();
}

export function getCurrentRank() {
    return gameState.getCurrentRank();
}

export function getUnclaimedRewards() {
    return gameState.getUnclaimedRewards();
}

export function claimRewards() {
    return gameState.claimRewards();
}

export function deposit(amount) {
    return gameState.deposit(amount);
}

export function withdraw(amount) {
    return gameState.withdraw(amount);
}
