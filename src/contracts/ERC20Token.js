class ERC20Token {
    constructor(name, symbol, initialSupply, formatAmount) {
        this.name = name;
        this.symbol = symbol;
        this.totalSupply = initialSupply;
        this.balances = { '0x0': initialSupply };
        this.allowances = {};
        this.formatAmount = formatAmount || ((amount) => amount.toFixed(2));
    }

    transfer(from, to, amount) {
        if (this.balances[from] < amount) {
            throw new Error('Insufficient balance');
        }
        this.balances[from] -= amount;
        this.balances[to] = (this.balances[to] || 0) + amount;
        console.log(`${this.symbol}: Transferred ${this.formatAmount(amount)} tokens from ${from} to ${to}`);
        return true;
    }

    approve(owner, spender, amount) {
        if (!this.allowances[owner]) {
            this.allowances[owner] = {};
        }
        this.allowances[owner][spender] = amount;
        console.log(`Approved ${this.formatAmount(amount)} ${this.symbol} tokens for ${spender} from ${owner}`);
        return true;
    }

    transferFrom(from, to, amount, by = from) {
        if (this.balances[from] < amount) {
            throw new Error(`Insufficient balance: ${this.formatAmount(this.balances[from])} < ${this.formatAmount(amount)}`);
        }
        if (this.allowances[from]?.[by] < amount) {
            throw new Error(`Insufficient allowance: ${this.formatAmount(this.allowances[from]?.[by] || 0)} < ${this.formatAmount(amount)}`);
        }
        this.balances[from] -= amount;
        this.balances[to] = (this.balances[to] || 0) + amount;
        this.allowances[from][by] -= amount;
        console.log(`${this.symbol}: Transferred ${this.formatAmount(amount)} tokens from ${from} to ${to} by ${by}`);
    }

    balanceOf(account) {
        return this.balances[account] || 0;
    }

    allowance(owner, spender) {
        return (this.allowances[owner] && this.allowances[owner][spender]) || 0;
    }

    mint(user, amount) {
        this.balances[user] = (this.balances[user] || 0) + amount;
        this.totalSupply += amount;
        console.log(`Minted ${this.formatAmount(amount)} ${this.symbol} tokens for ${user}. New balance: ${this.formatAmount(this.balances[user])}`);
    }

    burn(from, amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            throw new Error("Invalid amount to burn");
        }
        if (this.balances[from] < amount) {
            throw new Error("Insufficient balance to burn");
        }
        this.balances[from] -= amount;
        this.totalSupply -= amount;
        console.log(`Burned ${this.formatAmount(amount)} ${this.symbol} tokens from ${from}. New balance: ${this.formatAmount(this.balances[from])}`);
    }
}

module.exports = ERC20Token;