import React, { useState, useEffect } from 'react';
import { gameState } from '../services/gameState';

function Notifications() {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const checkForNotifications = () => {
      const currentRank = gameState.getCurrentRank();
      const unclaimedRewards = gameState.getUnclaimedRewards();

      if (currentRank === 97 || currentRank === 101) {
        setNotifications(prev => [...prev, `You've entered a prime rank: ${currentRank}`]);
      }

      if (unclaimedRewards > 100) {
        setNotifications(prev => [...prev, `You have ${unclaimedRewards.toFixed(2)} unclaimed rewards. Claim them now!`]);
      }
    };

    const interval = setInterval(checkForNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="notifications">
      <h2>Notifications</h2>
      <ul>
        {notifications.map((notification, index) => (
          <li key={index}>{notification}</li>
        ))}
      </ul>
    </div>
  );
}

export default Notifications;