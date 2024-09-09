import React, { useState, useEffect } from 'react';
import { gameState } from '../services/gameState';

function Leaderboard() {
  const [leaderboardData, setLeaderboardData] = useState([]);

  useEffect(() => {
    const fetchLeaderboard = () => {
      if (gameState && gameState.boopTheSnoot) {
        const data = gameState.boopTheSnoot.getRankings().map(player => {
          const stats = gameState.boopTheSnoot.getPlayerStatsWithRewards(player);
          return {
            address: player,
            rank: gameState.boopTheSnoot.getRankings().indexOf(player) + 1,
            balance: stats.lpTokens || 0,
            totalRewards: stats.totalRewardsReceived || 0
          };
        }).sort((a, b) => a.rank - b.rank);
        setLeaderboardData(data);
      }
    };

    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="leaderboard">
      <h2>Leaderboard</h2>
      <ul>
        {leaderboardData.map((player, index) => (
          <li key={player.address}>
            {index + 1}. {player.address.slice(0, 6)}...{player.address.slice(-4)} - 
            Rank: {player.rank}, 
            Balance: {player.balance.toFixed(2)} SIP, 
            Total Rewards: {player.totalRewards.toFixed(2)} SIP
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Leaderboard;