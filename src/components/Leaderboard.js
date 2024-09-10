import React, { useState, useEffect } from 'react';
import { gameState } from '../services/gameState';

function Leaderboard() {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    const updateLeaderboard = () => {
      const rankings = gameState.getLeaderboard();
      const updatedPlayers = rankings.map((player, index) => {
        const rank = index + 1;
        const predictedRewards = gameState.predictEarnings(rank);
        return {
          ...player,
          rank,
          predictedRewards
        };
      });
      setPlayers(updatedPlayers);
    };

    updateLeaderboard();
    const interval = setInterval(updateLeaderboard, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="leaderboard">
      <h2>Leaderboard</h2>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Address</th>
            <th>Balance</th>
            <th>Total Rewards</th>
            <th>Predicted Rewards (10 min)</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.address}>
              <td>{player.rank}</td>
              <td>{player.address.slice(0, 6)}...{player.address.slice(-4)}</td>
              <td>{player.balance.toFixed(2)}</td>
              <td>{player.totalRewards.toFixed(2)}</td>
              <td>{player.predictedRewards.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Leaderboard;