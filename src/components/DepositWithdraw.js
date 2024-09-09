import React, { useState } from 'react';
import { deposit, withdraw } from '../services/tokenSimulation';

function DepositWithdraw({ onUpdate }) {
  const [amount, setAmount] = useState('');

  const handleDeposit = () => {
    const result = deposit(Number(amount));
    if (result.success) {
      onUpdate();
      setAmount('');
    } else {
      console.error(result.error);
      // Show error message to user
    }
  };

  const handleWithdraw = () => {
    const result = withdraw(Number(amount));
    if (result.success) {
      onUpdate();
      setAmount('');
    } else {
      console.error(result.error);
      // Show error message to user
    }
  };

  return (
    <div className="deposit-withdraw">
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Enter amount"
      />
      <button onClick={handleDeposit}>Deposit</button>
      <button onClick={handleWithdraw}>Withdraw</button>
    </div>
  );
}

export default DepositWithdraw;