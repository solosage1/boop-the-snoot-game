import React, { useState, useEffect } from 'react';
import DepositWithdraw from './DepositWithdraw';
import BoopTheSnoot from './BoopTheSnoot';
import Leaderboard from './Leaderboard';
import Notifications from './Notifications';
import GameGuide from './GameGuide';
import CompleteGameGuide from './CompleteGameGuide';
import { gameState } from '../services/gameState';

function Dashboard({ gameState }) {
  const [userRank, setUserRank] = useState(0);
  const [userBalance, setUserBalance] = useState(0);
  const [unclaimedRewards, setUnclaimedRewards] = useState(0);
  const [flashReward, setFlashReward] = useState(false);
  const [showCompleteGuide, setShowCompleteGuide] = useState(false);

  useEffect(() => {
    const blockInterval = setInterval(() => {
      gameState.simulateBlock();
      updateUserInfo();
      setFlashReward(true);
      setTimeout(() => setFlashReward(false), 500);
    }, 10000); // Simulate a block every 10 seconds

    return () => clearInterval(blockInterval);
  }, []);

  const updateUserInfo = () => {
    setUserBalance(gameState.getUserBalance());
    setUserRank(gameState.getCurrentRank());
    setUnclaimedRewards(gameState.getUnclaimedRewards());
  };

  const handleClaimRewards = () => {
    const result = gameState.claimRewards();
    if (result.success) {
        setUnclaimedRewards(0);
        setUserBalance(prevBalance => prevBalance + result.claimedAmount);
    } else {
        console.error(result.error);
        // Show error message to user
    }
  };

  const addSimulatedPlayer = () => {
    const playerId = `player${gameState.players.length + 1}`;
    gameState.addPlayer(playerId);
  };

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">
        🐻 BoopTheSnoot Dashboard 🍯
      </h1>
      <GameGuide />
      <button onClick={() => setShowCompleteGuide(!showCompleteGuide)}>
        {showCompleteGuide ? 'Hide Complete Guide' : 'Show Complete Guide'}
      </button>
      {showCompleteGuide && <CompleteGameGuide />}
      <div className={`user-info ${flashReward ? 'flash' : ''}`}>
        <div className="info-item">
          <span className="info-label">🏆 Rank:</span>
          <span className="info-value">{userRank}</span>
        </div>
        <div className="info-item">
          <span className="info-label">💰 Balance:</span>
          <span className="info-value">{userBalance} SIP</span>
        </div>
        <div className="info-item">
          <span className="info-label">🍯 Unclaimed Rewards:</span>
          <span className="info-value">{unclaimedRewards.toFixed(2)} SIP</span>
        </div>
      </div>
      <BoopTheSnoot userRank={userRank} userBalance={userBalance} onUpdate={updateUserInfo} />
      <Leaderboard gameState={gameState} />
      <Notifications />
      <button onClick={addSimulatedPlayer}>Add Simulated Player</button>
    </div>
  );
}

export default Dashboard;