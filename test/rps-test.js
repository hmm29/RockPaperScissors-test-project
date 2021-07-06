const { assert, expect } = require("chai");
const { ethers } = require("hardhat");
const bytes32 = require('bytes32');

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

it("Should allow owner to create a game after contract creation.", async function () {
    const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
    const rps = await RockPaperScissors.deploy("RockPaperScissors", "RPS", 100);
    await rps.deployed();

    const generateGameIdTx = await rps.generateGameId(1, bytes32({input: "it's my secret."}));

    // wait until the transaction is mined
    console.log(`generated game id: ${generateGameIdTx}`);

    const [owner, addr1] = await ethers.getSigners();

    const balance = await rps.balanceOf(owner.address);
    console.log(`balance: ${balance}`);

    const createGameTx = await rps.createGame(generateGameIdTx, addr1.address, 60, 12, false);

    // wait until the transaction is mined
    await createGameTx.wait();

    const [,opponent,,,,,] = await rps.games(generateGameIdTx);
    expect(opponent).to.equal(addr1.address);
});

it("Should prevent player from creating game if they have an insufficient balance.", async function () {
    const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
    const rps = await RockPaperScissors.deploy("RockPaperScissors", "RPS", 100);
    await rps.deployed();

    const [, addr1, addr2] = await ethers.getSigners();

    try {
    const generateGameIdTx = await rps.connect(addr1).generateGameId(1, bytes32({ input: "super secret!" }));

    // wait until the transaction is mined
    console.log(`generated game id: ${generateGameIdTx}`);

    const balance = await rps.connect(addr1).balanceOf(addr1.address);
    console.log(`non-owner account balance: ${balance}`);

    const createGameTx = await rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 60, 12, false);

    // wait until the transaction is mined
    await createGameTx.wait();
    } catch(error) {
        expect(error.message, 'test revert [transaction execution reverts if insufficient balance]').to.equal("VM Exception while processing transaction: reverted with reason string 'Insufficient token balance to create a new game.'");
    }
});