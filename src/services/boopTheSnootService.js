import { gameState } from './gameState';

export function calculateNextBestRank(currentRank, currentBalance) {
    return gameState.boopTheSnoot.calculateNextBestRank(currentRank, currentBalance);
}

export function calculateBestLowerRank(currentRank, currentBalance) {
    return gameState.boopTheSnoot.calculateBestLowerRank(currentRank, currentBalance);
}

export function predictEarnings(rank, timeInMinutes) {
    return gameState.boopTheSnoot.predictEarnings(rank, timeInMinutes);
}