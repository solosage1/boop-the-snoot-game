import React, { useState, useEffect } from 'react';
import { deposit, withdraw } from '../services/tokenSimulation';

function DepositWithdraw({ onUpdate, initialAmount, userBalance }) {
  const [amount, setAmount] = useState(initialAmount || '');
  const [action, setAction] = useState('Enter Amount');

  useEffect(() => {
    if (initialAmount) {
      setAmount(initialAmount);
      setAction(initialAmount > 0 ? 'Deposit' : 'Withdraw');
    } else {
      setAction('Enter Amount');
    }
  }, [initialAmount]);

  const handleAction = () => {
    if (action === 'Deposit') {
      const result = deposit(Number(amount));
      if (result.success) {
        onUpdate();
        setAmount('');
        setAction('Enter Amount');
      } else {
        console.error(result.error);
      }
    } else if (action === 'Withdraw') {
      const result = withdraw(Number(Math.abs(amount)));
      if (result.success) {
        onUpdate();
        setAmount('');
        setAction('Enter Amount');
      } else {
        console.error(result.error);
      }
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setAmount(value);
    if (value === '') {
      setAction('Enter Amount');
    } else if (Number(value) > 0) {
      setAction('Deposit');
    } else if (Number(value) < 0) {
      setAction('Withdraw');
    }
  };

  return (
    <div className="deposit-withdraw">
      <input
        type="number"
        value={amount}
        onChange={handleInputChange}
        placeholder="Enter amount"
        className="amount-input"
      />
      <button 
        onClick={handleAction}
        className={`action-button ${action !== 'Enter Amount' ? 'flash' : ''}`}
        disabled={action === 'Enter Amount'}
      >
        {action}
      </button>
    </div>
  );
}

export default DepositWithdraw;