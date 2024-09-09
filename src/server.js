const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { Blockchain } = require('./services/simulated-blockchain');
const SIP = require('./contracts/SIP');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '..', 'build')));

// Initialize blockchain and SIP contract
const blockchain = new Blockchain();
const sipContract = new SIP(1000000); // Initial supply of 1,000,000 SIP tokens

// Game state
const players = new Map();
const ranks = [];

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);

  // Handle player registration
  socket.on('register', (address) => {
    players.set(socket.id, { address, rank: ranks.length });
    ranks.push(socket.id);
    updateGameState();
  });

  // Handle SIP deposit
  socket.on('deposit', (amount) => {
    const player = players.get(socket.id);
    if (player) {
      try {
        sipContract.transfer(player.address, '0x0', amount); // Transfer to treasury
        adjustRank(socket.id, amount);
        updateGameState();
      } catch (error) {
        socket.emit('error', error.message);
      }
    }
  });

  // Handle SIP withdrawal
  socket.on('withdraw', (amount) => {
    const player = players.get(socket.id);
    if (player) {
      try {
        sipContract.transfer('0x0', player.address, amount); // Transfer from treasury
        adjustRank(socket.id, -amount);
        updateGameState();
      } catch (error) {
        socket.emit('error', error.message);
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    const player = players.get(socket.id);
    if (player) {
      players.delete(socket.id);
      const index = ranks.indexOf(socket.id);
      if (index > -1) {
        ranks.splice(index, 1);
      }
      updateGameState();
    }
  });
});

function adjustRank(playerId, amount) {
  const currentIndex = ranks.indexOf(playerId);
  if (currentIndex > -1) {
    ranks.splice(currentIndex, 1);
    
    // Find new position
    let newIndex = ranks.findIndex((id) => {
      const otherPlayer = players.get(id);
      const currentPlayer = players.get(playerId);
      return sipContract.balanceOf(otherPlayer.address) < sipContract.balanceOf(currentPlayer.address) + amount;
    });
    
    if (newIndex === -1) {
      newIndex = ranks.length;
    }
    
    ranks.splice(newIndex, 0, playerId);
    players.get(playerId).rank = newIndex;
  }
}

function updateGameState() {
  const gameState = {
    players: Array.from(players.entries()).map(([id, player]) => ({
      id,
      address: player.address,
      balance: sipContract.balanceOf(player.address),
      rank: player.rank
    })),
    ranks: ranks.map(id => ({
      id,
      address: players.get(id).address,
      balance: sipContract.balanceOf(players.get(id).address)
    }))
  };
  io.emit('gameState', gameState);
}

// API endpoints
app.get('/api/leaderboard', (req, res) => {
  const leaderboard = ranks.map((id, index) => ({
    address: players.get(id).address,
    rank: index + 1,
    balance: sipContract.balanceOf(players.get(id).address)
  })).slice(0, 10);
  res.json(leaderboard);
});

app.get('/api/notifications', (req, res) => {
  // Implement notification logic here
  res.json(['Notification 1', 'Notification 2']);
});

app.post('/api/deposit', (req, res) => {
  // Implement deposit logic here
  res.json({ success: true });
});

app.post('/api/withdraw', (req, res) => {
  // Implement withdraw logic here
  res.json({ success: true });
});

// The "catchall" handler: for any request that doesn't match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});