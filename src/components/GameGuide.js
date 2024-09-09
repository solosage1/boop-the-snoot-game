import React, { useState } from 'react';

function GameGuide() {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleGuide = () => setIsExpanded(!isExpanded);

  return (
    <div className="game-guide">
      <h2 onClick={toggleGuide} style={{ cursor: 'pointer' }}>
        🐻🍯 BoopTheSnoot: A Beary Sweet Adventure! {isExpanded ? '▲' : '▼'}
      </h2>
      {isExpanded && (
        <div>
          <p>
            Toss your $SIP in the honey pot to grow into a bigger bera, earn JUG tokens dripping with $SIP and $HONEY, and boop that snoot to shuffle your bera size for maximum treats! Big beras get cozy with steady snacks, while little beras can scamper for huge honey hauls – it's a beary exciting forest feast where every block brings new chances to fill your belly!
          </p>
          <h3>🐾 Step 1: Stash Your $SIP</h3>
          <p>Chuck your $SIP into the honey pot! More $SIP means you're a bigger, comfier bera in the Bera Cave!</p>
          <h3>🍯 Step 2: Claim Your Liquid Gold JUGs</h3>
          <p>Every forest tick (block), your JUGs fill up with a mix of $SIP and $HONEY!</p>
          <h3>👉🐽 Step 3: Boop That Snoot!</h3>
          <p>Decide to grow bigger or shrink down. Big bera or small bera? Lazy lounger or honey hustler? You decide!</p>
          <h3>🏆 Step 4: Eye on the Honey Forest</h3>
          <p>Check out other beras and their ranks. Can you outmaneuver them for more honey?</p>
          <a href="#" onClick={(e) => { e.preventDefault(); alert('Full guide coming soon!'); }}>
            View Full Guide
          </a>
        </div>
      )}
    </div>
  );
}

export default GameGuide;