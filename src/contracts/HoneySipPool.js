const ERC20Token = require('./ERC20Token');

class HoneySipPool {
	constructor(sip, honey) {
		this.sip = sip;
		this.honey = honey;
		this.lpToken = new ERC20Token('HoneySip LP', 'HSLP', 0, this.sip.formatAmount);
		this.address = 'HoneySipPoolContract';
		this.reserveSIP = 0;
		this.reserveHONEY = 0;
	}

	addLiquidity(user, sipAmount, honeyAmount) {
		this.sip.transferFrom(user, this.address, sipAmount, this.address);
		this.honey.transferFrom(user, this.address, honeyAmount, this.address);

		const lpToMint = Math.min(sipAmount, honeyAmount);
		this.lpToken.mint(user, lpToMint);

		this.reserveSIP += sipAmount;
		this.reserveHONEY += honeyAmount;

		return lpToMint;
	}

	removeLiquidity(user, lpAmount) {
		const totalLpSupply = this.lpToken.totalSupply;
		const sipToReturn = (lpAmount * this.reserveSIP) / totalLpSupply;
		const honeyToReturn = (lpAmount * this.reserveHONEY) / totalLpSupply;

		this.lpToken.burn(user, lpAmount);

		this.sip.transfer(this.address, user, sipToReturn);
		this.honey.transfer(this.address, user, honeyToReturn);

		this.reserveSIP -= sipToReturn;
		this.reserveHONEY -= honeyToReturn;

		return { sipAmount: sipToReturn, honeyAmount: honeyToReturn };
	}

	swap(user, tokenIn, amountIn, tokenOut, minAmountOut) {
		console.log(`Swapping ${this.sip.formatAmount(amountIn)} ${tokenIn} for ${tokenOut}`);
		
		const reserveIn = tokenIn === 'SIP' ? this.sip.balanceOf(this.address) : this.honey.balanceOf(this.address);
		const reserveOut = tokenOut === 'SIP' ? this.sip.balanceOf(this.address) : this.honey.balanceOf(this.address);

		// Calculate amount out (using simplified formula)
		const amountInWithFee = amountIn * 997; // 0.3% fee
		const numerator = amountInWithFee * reserveOut;
		const denominator = reserveIn * 1000 + amountInWithFee;
		const amountOut = Math.floor(numerator / denominator);

		if (amountOut < minAmountOut) {
			throw new Error('Insufficient output amount');
		}

		// Transfer tokens
		if (tokenIn === 'SIP') {
			this.sip.transferFrom(user, this.address, amountIn, this.address);
			this.honey.transfer(this.address, user, amountOut);
		} else {
			this.honey.transferFrom(user, this.address, amountIn, this.address);
			this.sip.transfer(this.address, user, amountOut);
		}

		console.log(`Swapped ${this.sip.formatAmount(amountIn)} ${tokenIn} for ${this.sip.formatAmount(amountOut)} ${tokenOut}`);
		return amountOut;
	}

	balanceOf(account) {
		return this.lpToken.balanceOf(account);
	}

	tokenBalanceOf(token, account) {
		if (token === 'SIP') {
			return this.sip.balanceOf(account);
		} else if (token === 'HONEY') {
			return this.honey.balanceOf(account);
		} else if (token === 'LP') {
			return this.lpToken.balanceOf(account);
		}
		throw new Error('Invalid token type');
	}
}

module.exports = HoneySipPool;