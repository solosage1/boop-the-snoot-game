import React, { useState, useEffect } from 'react';
import { gameState } from '../services/gameState';

function BoopTheSnoot({ userRank, userBalance }) {
  const [currentPrediction, setCurrentPrediction] = useState(0);
  const [bestHigherRank, setBestHigherRank] = useState({ rank: 0, earnings: 0, depositAmount: 0 });
  const [bestLowerRank, setBestLowerRank] = useState({ rank: 0, earnings: 0, withdrawAmount: 0 });

  useEffect(() => {
    const predictEarnings = (rank) => gameState.boopTheSnoot.predictEarnings(rank, 10);
    
    setCurrentPrediction(predictEarnings(userRank));

    let bestHigher = { rank: userRank, earnings: predictEarnings(userRank), depositAmount: 0 };
    for (let i = 1; i <= 10; i++) {
      if (userRank - i > 0) {
        const earnings = predictEarnings(userRank - i);
        if (earnings > bestHigher.earnings) {
          const depositAmount = gameState.boopTheSnoot.getDepositAmountForRank(userRank - i) - userBalance;
          bestHigher = { rank: userRank - i, earnings, depositAmount };
        }
      }
    }
    setBestHigherRank(bestHigher);

    let bestLower = { rank: userRank, earnings: predictEarnings(userRank), withdrawAmount: 0 };
    for (let i = 1; i <= 10; i++) {
      const earnings = predictEarnings(userRank + i);
      if (earnings > bestLower.earnings) {
        const withdrawAmount = userBalance - gameState.boopTheSnoot.getDepositAmountForRank(userRank + i);
        bestLower = { rank: userRank + i, earnings, withdrawAmount };
      }
    }
    setBestLowerRank(bestLower);
  }, [userRank, userBalance]);

  const calculatePercentageChange = (newValue, oldValue) => {
    const change = ((newValue - oldValue) / oldValue * 100).toFixed(2);
    return newValue > oldValue ? `+${change}` : change;
  };

  return (
    <div className="boop-the-snoot">
      <h2>Boop the Snoot</h2>
      <div className="bear-nose-container">
        <div className="bear-nose" onClick={() => alert('Boop!')}>
          🐽
        </div>
        <p className="boop-instruction">
          Boop to deposit {bestHigherRank.depositAmount.toFixed(2)} SIP ({calculatePercentageChange(userBalance + bestHigherRank.depositAmount, userBalance)}% change)
          <br />
          for {calculatePercentageChange(bestHigherRank.earnings, currentPrediction)}% more rewards!
        </p>
      </div>
      <div className="current-prediction">
        <h3>Current Rank Prediction</h3>
        <p>Your predicted earnings at rank {userRank}: {currentPrediction.toFixed(2)} SIP in 10 minutes</p>
      </div>
      <div className="secondary-action">
        <p>
          Or withdraw {bestLowerRank.withdrawAmount.toFixed(2)} SIP ({calculatePercentageChange(userBalance - bestLowerRank.withdrawAmount, userBalance)}% change) for {calculatePercentageChange(bestLowerRank.earnings, currentPrediction)}% more rewards
        </p>
        <button className="withdraw-button">Withdraw</button>
      </div>
    </div>
  );
}

export default BoopTheSnoot;