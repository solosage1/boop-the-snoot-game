const ERC20Token = require('./ERC20Token');
const SIP = require('./SIP');
const HONEY = require('./HONEY');
const HoneySipPool = require('./HoneySipPool');

class AquaBeraVault {
    constructor(sip, honey, honeySipPool) {
        this.sip = sip;
        this.honey = honey;
        this.honeySipPool = honeySipPool;
        this.lpToken = new ERC20Token('AquaBeraVault LP', 'ABVLP', 0, this.sip.formatAmount);
        this.address = 'AquaBeraVaultContract';
        this.totalHoneySipLp = 0;
    }

    deposit(user, sipAmount) {
        // Transfer SIP from user to vault
        this.sip.transferFrom(user, this.address, sipAmount, this.address);

        // Swap half of SIP for HONEY
        const sipToSwap = Math.floor(sipAmount / 2);
        
        // Approve HoneySipPool to spend SIP tokens
        this.sip.approve(this.address, this.honeySipPool.address, sipToSwap);
        
        // Perform the swap
        const honeyReceived = this.honeySipPool.swap(this.address, 'SIP', sipToSwap, 'HONEY', 0);

        // Deposit remaining SIP and received HONEY to HoneySipPool
        const remainingSip = sipAmount - sipToSwap;
        this.sip.approve(this.address, this.honeySipPool.address, remainingSip);
        this.honey.approve(this.address, this.honeySipPool.address, honeyReceived);
        const honeySipLpReceived = this.honeySipPool.addLiquidity(this.address, remainingSip, honeyReceived);

        // Mint AquaBeraVault LP tokens to user
        const abvLpToMint = this.calculateLpTokens(honeySipLpReceived);
        this.lpToken.mint(user, abvLpToMint);

        this.totalHoneySipLp += honeySipLpReceived;
        return abvLpToMint;
    }

    withdraw(user, abvLpAmount) {
        const honeySipLpToWithdraw = this.calculateHoneySipLpAmount(abvLpAmount);
        
        // Burn AquaBeraVault LP tokens
        this.lpToken.burn(user, abvLpAmount);

        // Remove liquidity from HoneySipPool
        const { sipAmount, honeyAmount } = this.honeySipPool.removeLiquidity(this.address, honeySipLpToWithdraw);

        // Transfer SIP and HONEY back to user
        this.sip.transfer(this.address, user, sipAmount);
        this.honey.transfer(this.address, user, honeyAmount);

        this.totalHoneySipLp -= honeySipLpToWithdraw;
        return { sipAmount, honeyAmount };
    }

    calculateLpTokens(honeySipLpAmount) {
        if (this.totalHoneySipLp === 0) return honeySipLpAmount;
        return (honeySipLpAmount * this.lpToken.totalSupply) / this.totalHoneySipLp;
    }

    calculateHoneySipLpAmount(abvLpAmount) {
        return (abvLpAmount * this.totalHoneySipLp) / this.lpToken.totalSupply;
    }

    mintLpTokens(user, amount) {
        this.lpToken.mint(user, amount);
        // Remove any console.log statements from here
    }
}

module.exports = AquaBeraVault;