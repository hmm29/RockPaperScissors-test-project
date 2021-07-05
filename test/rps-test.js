const { expect } = require("chai");
const { utils } = require('web3');

describe("RockPaperScissors", function () {
    it("Should return the name, symbol, and feeInTokens to play.", async function () {
        const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
        const rps = await RockPaperScissors.deploy("RockPaperScissors", "RPS", 5);
        await rps.deployed();

        expect(await rps.name()).to.equal("RockPaperScissors");
        expect(await rps.symbol()).to.equal("RPS");
        expect(await rps.feeInTokens()).to.equal(5);
    });

    it("Should allow owner to change fee in tokens.", async function () {
        const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
        const rps = await RockPaperScissors.deploy("RockPaperScissors", "RPS", 5);
        await rps.deployed();
        
        const setFeeInTokensTx = await rps.setFeeInTokens(81);

        // wait until the transaction is mined
        await setFeeInTokensTx.wait();

        expect(await rps.feeInTokens()).to.equal(81);
    });
});
