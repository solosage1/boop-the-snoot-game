const ERC20Token = require('./ERC20Token');

class SIP extends ERC20Token {
    constructor(initialSupply, formatAmount) {
        super('Simulated Incentive Point', 'SIP', initialSupply, formatAmount);
    }
}

module.exports = SIP;