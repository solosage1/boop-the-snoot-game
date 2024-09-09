const ERC20Token = require('./ERC20Token');

class HONEY extends ERC20Token {
    constructor(initialSupply, formatAmount) {
        super('HONEY Token', 'HONEY', initialSupply, formatAmount);
    }
}

module.exports = HONEY;