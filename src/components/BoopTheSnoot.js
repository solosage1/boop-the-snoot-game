import React, { useState } from 'react';
import boopImage from '../assets/boop-the-snoot.svg';
import Modal from './Modal';
import DepositWithdraw from './DepositWithdraw';
import { gameState } from '../services/gameState';

function BoopTheSnoot({ userRank, userBalance, onUpdate }) {
  const [showModal, setShowModal] = useState(false);
  const [showPrediction, setShowPrediction] = useState(false);
  const [showExtraInfo, setShowExtraInfo] = useState(false);
  const [slideoutOpen, setSlideoutOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState(0);
  const [currentPrediction, setCurrentPrediction] = useState(0);
  const [bestHigherRank, setBestHigherRank] = useState({ depositAmount: 0, earnings: 0 });
  const [bestWithdrawOption, setBestWithdrawOption] = useState({ withdrawAmount: 0, newRank: 0, rewardChange: 0 });

  const calculateBestHigherRank = () => {
    try {
      const currentRank = gameState.getCurrentRank();
      const currentBalance = gameState.getUserBalance();
      let bestRank = { rank: currentRank, depositAmount: 0, rewardChange: 0 };
      const currentEarnings = gameState.predictEarnings(currentRank);

      // Check the next 10 higher ranks
      for (let i = 1; i <= 10; i++) {
        const targetRank = Math.max(1, currentRank - i);
        const depositNeeded = gameState.getDepositAmountForRank(targetRank) - currentBalance;
        if (depositNeeded > 0) {
          const newEarnings = gameState.predictEarnings(targetRank);
          const rewardChange = ((newEarnings - currentEarnings) / currentEarnings) * 100;
          
          if (rewardChange > bestRank.rewardChange) {
            bestRank = { rank: targetRank, depositAmount: depositNeeded, rewardChange };
          }
        }
      }

      return bestRank;
    } catch (error) {
      console.error('Error calculating best higher rank:', error);
      return { rank: gameState.getCurrentRank(), depositAmount: 0, rewardChange: 0 };
    }
  };

  const calculateBestWithdrawOption = () => {
    try {
      const currentRank = gameState.getCurrentRank();
      const currentBalance = gameState.getUserBalance();
      let bestRank = { rank: currentRank, withdrawAmount: 0, rewardChange: 0 };
      const currentEarnings = gameState.predictEarnings(currentRank);

      // Check up to 5 lower ranks
      for (let i = 1; i <= 5; i++) {
        const targetRank = currentRank + i;
        const balanceForRank = gameState.getDepositAmountForRank(targetRank);
        if (balanceForRank < currentBalance) {
          const withdrawAmount = currentBalance - balanceForRank;
          const newEarnings = gameState.predictEarnings(targetRank);
          const rewardChange = ((newEarnings - currentEarnings) / currentEarnings) * 100;
          
          if (rewardChange > bestRank.rewardChange) {
            bestRank = { rank: targetRank, withdrawAmount, rewardChange };
          }
        }
      }

      return bestRank;
    } catch (error) {
      console.error('Error calculating best withdraw option:', error);
      return { rank: gameState.getCurrentRank(), withdrawAmount: 0, rewardChange: 0 };
    }
  };

  const handleBoop = () => {
    const newBestHigherRank = calculateBestHigherRank();
    setBestHigherRank(newBestHigherRank);
    const newBestWithdrawOption = calculateBestWithdrawOption();
    setBestWithdrawOption(newBestWithdrawOption);
    setCurrentPrediction(gameState.predictEarnings(gameState.getCurrentRank()));
    setShowModal(true);
  };

  const handleDepositWithdrawComplete = () => {
    setShowModal(false);
    onUpdate();
  };

  return (
    <div className="boop-the-snoot">
      <div className="boop-image-container" onMouseEnter={() => setShowPrediction(true)} onMouseLeave={() => setShowPrediction(false)}>
        <img src={boopImage} alt="Boop the Snoot" onClick={handleBoop} />
        {showPrediction && (
          <div className="prediction-tooltip">
            Your predicted earnings at rank {userRank}: {currentPrediction.toFixed(2)} SIP in 10 minutes
          </div>
        )}
      </div>

      <button className="info-toggle" onClick={() => setShowExtraInfo(!showExtraInfo)}>
        {showExtraInfo ? 'Hide' : 'Show'} Extra Info
      </button>

      {showExtraInfo && (
        <div className="extra-info">
          <p>Additional information about the game...</p>
        </div>
      )}

      <button className="slideout-toggle" onClick={() => setSlideoutOpen(!slideoutOpen)}>
        {slideoutOpen ? 'Close' : 'Open'} Slideout
      </button>

      <div className={`slideout-panel ${slideoutOpen ? 'open' : ''}`}>
        <h3>Game Statistics</h3>
        <p>Total players: {gameState.getTotalPlayers()}</p>
        <p>Average reward: {gameState.getAverageReward().toFixed(2)} SIP</p>
        {/* Add more game statistics here */}
      </div>

      <Modal show={showModal} onClose={() => setShowModal(false)}>
        <h2>Deposit or Withdraw</h2>
        <div>
          <p>
            {bestHigherRank.rewardChange > 0 
              ? `Recommended: Deposit ${bestHigherRank.depositAmount.toFixed(2)} SIP to climb to rank ${bestHigherRank.rank}, increasing your rewards by ${bestHigherRank.rewardChange.toFixed(2)}%`
              : `No beneficial deposit options available, but you can still deposit to improve your rank.`}
          </p>
          <p>
            (Current earnings: {currentPrediction.toFixed(2)} SIP per 10 minutes)
          </p>
          <DepositWithdraw 
            onUpdate={onUpdate} 
            initialAmount={bestHigherRank.depositAmount}
            userBalance={userBalance}
            onComplete={handleDepositWithdrawComplete}
          />
        </div>
        {bestWithdrawOption.rewardChange > 0 ? (
          <p className="withdraw-option">
            Or withdraw {bestWithdrawOption.withdrawAmount.toFixed(2)} SIP to drop to rank {bestWithdrawOption.rank}, 
            increasing your rewards by {bestWithdrawOption.rewardChange.toFixed(2)}%
          </p>
        ) : (
          <p className="withdraw-option">
            No beneficial withdrawal options available at this time.
          </p>
        )}
        <button className="cancel-button" onClick={() => setShowModal(false)}>Cancel</button>
      </Modal>
    </div>
  );
}

export default BoopTheSnoot;