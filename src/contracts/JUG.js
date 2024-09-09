const ERC20Token = require('./ERC20Token');

class JUG extends ERC20Token {
    constructor(aquaBeraVault, initialBlockNumber, maturityBlockNumber, formatAmount) {
        super('JUG Token', 'JUG', 0, formatAmount);
        this.aquaBeraVault = aquaBeraVault;
        this.initialBlockNumber = initialBlockNumber;
        this.maturityBlockNumber = maturityBlockNumber;
        this.totalLpTokens = 0;
    }

    redeem(user, jugAmount, currentBlock) {
        if (this.balanceOf(user) < jugAmount) {
            throw new Error("Insufficient JUG balance");
        }

        const totalJugSupply = this.totalSupply;
        const redemptionProportion = jugAmount / totalJugSupply;

        const maturityFactor = Math.min(1, Math.max(0, (currentBlock - this.initialBlockNumber) / (this.maturityBlockNumber - this.initialBlockNumber)));

        const lpTokensToDistribute = Math.floor(this.totalLpTokens * redemptionProportion * maturityFactor);

        this.burn(user, jugAmount);

        if (lpTokensToDistribute > 0) {
            this.aquaBeraVault.mintLpTokens(user, lpTokensToDistribute);
            this.totalLpTokens -= lpTokensToDistribute;
        }

        console.log(`Redeemed ${this.formatAmount(jugAmount)} JUG tokens for ${this.formatAmount(lpTokensToDistribute)} AquaBeraVault LP tokens`);
        return lpTokensToDistribute;
    }

    updateLpTokens(currentBlock, newLpTokens) {
        this.totalLpTokens += newLpTokens;
        console.log(`Updated JUG contract with ${this.formatAmount(newLpTokens)} new LP tokens at block ${currentBlock}`);
    }

    mint(user, amount) {
        super.mint(user, amount);
        // Remove the extra console.log from here
    }
}

module.exports = JUG;