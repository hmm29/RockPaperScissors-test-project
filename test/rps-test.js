const { expect } = require("chai");
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

    const generateGameIdTx = await rps.generateGameId(1, bytes32({input: "super secret!"}));

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

it("Should prevent player from using a wager that exceeds that player's balance", async function () {
    const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
    const rps = await RockPaperScissors.deploy("RockPaperScissors", "RPS", 100);
    await rps.deployed();

    const [, addr1, addr2] = await ethers.getSigners();

    // transfer from owner to addr1
    const transferTokenTx = await rps.transfer(addr1.address, 200);
    await transferTokenTx.wait();

    try {
        const generateGameIdTx = await rps.connect(addr1).generateGameId(1, bytes32({ input: "super secret!" }));

        // wait until the transaction is mined
        console.log(`generated game id: ${generateGameIdTx}`);

        const balance = await rps.connect(addr1).balanceOf(addr1.address);
        console.log(`non-owner account balance: ${balance}`);

        const createGameTx = await rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 60, 400, false);

        // wait until the transaction is mined
        await createGameTx.wait();
    } catch (error) {
        expect(error.message, 'test revert [wager amount exceeds balance]').to.equal("VM Exception while processing transaction: reverted with reason string 'Player doesn't have enough tokens for this wagered amount.'");
    }
});

it("Should prevent players from cancelling games that are not theirs.", async function () {
    const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
    const rps = await RockPaperScissors.deploy("RockPaperScissors", "RPS", 100);
    await rps.deployed();

    const [, addr1, addr2] = await ethers.getSigners();

    // transfer from owner to addr1
    const transferTokenTx = await rps.transfer(addr1.address, 200);
    await transferTokenTx.wait();

    try {
        const generateGameIdTx = await rps.connect(addr1).generateGameId(1, bytes32({ input: "super secret!" }));

        // wait until the transaction is mined
        console.log(`generated game id: ${generateGameIdTx}`);

        const balance = await rps.connect(addr1).balanceOf(addr1.address);
        console.log(`non-owner account balance: ${balance}`);

        const createGameTx = await rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 60, 10, false);

        // wait until the transaction is mined
        await createGameTx.wait();

        // attempt to cancel the game with this ID
        const cancelGameTx = await rps.connect(addr2).cancelGame(generateGameIdTx);

    } catch (error) {
        expect(error.message, 'test revert [players can only cancel their games]').to.equal("VM Exception while processing transaction: reverted with reason string 'Player is not player for this game; not permitted to cancel the game.'");
    }
});

it("Should allow players to play Rock Paper Scissors together.", async function () {
    const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
    const rps = await RockPaperScissors.deploy("RockPaperScissors", "RPS", 100);
    await rps.deployed();

    const [, addr1, addr2] = await ethers.getSigners();

    // transfer from owner to addr1
    const transfer1TokenTx = await rps.transfer(addr1.address, 200);
    await transfer1TokenTx.wait();

    const transfer2TokenTx = await rps.transfer(addr2.address, 200);
    await transfer2TokenTx.wait();

    const generateGameIdTx = await rps.connect(addr1).generateGameId(1, bytes32({ input: "super secret!" }));

    // wait until the transaction is mined
    console.log(`generated game id: ${generateGameIdTx}`);

    const balance1 = await rps.connect(addr1).balanceOf(addr1.address);
    console.log(`account 1 balance: ${balance1}`);

    const balance2 = await rps.connect(addr2).balanceOf(addr2.address);
    console.log(`account 2 balance: ${balance2}`);

    const createGameTx = await rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 60, 100, false);

    // wait until the transaction is mined
    await createGameTx.wait();

    const balance1PostGameCreate = await rps.connect(addr1).balanceOf(addr1.address);
    console.log(`account 1 balance post game create: ${balance1PostGameCreate}`);

    const joinGameTx = await rps.connect(addr2).joinGame(generateGameIdTx,2,100,false);
    
    // wait until the transaction is mined
    await joinGameTx.wait();

    const balance2PostGameJoin = await rps.connect(addr2).balanceOf(addr2.address);
    console.log(`account 2 balance post game join: ${balance2PostGameJoin}`);

    const revealMoveTx = await rps.connect(addr1).revealMove(1, bytes32({ input: "super secret!" }));

    // wait until the transaction is mined
    await revealMoveTx.wait();

    const balance1EndGame = await rps.connect(addr1).balanceOf(addr1.address);
    console.log(`account 1 balance end of game: ${balance1EndGame}`);

    const balance2EndGame = await rps.connect(addr2).balanceOf(addr2.address);
    console.log(`account 2 balance end of game: ${balance2EndGame}`);

    expect(balance1EndGame).to.equal(100);
    expect(balance2EndGame).to.equal(300);
});

it("Should allow players to play Rock Paper Scissors together and wager all their winnings.", async function () {
    const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
    const rps = await RockPaperScissors.deploy("RockPaperScissors", "RPS", 100);
    await rps.deployed();

    const [, addr1, addr2] = await ethers.getSigners();

    // transfer from owner to addr1
    const transfer1TokenTx = await rps.transfer(addr1.address, 200);
    await transfer1TokenTx.wait();

    const transfer2TokenTx = await rps.transfer(addr2.address, 200);
    await transfer2TokenTx.wait();

    const generateGameIdTx = await rps.connect(addr1).generateGameId(1, bytes32({ input: "super secret!" }));

    // wait until the transaction is mined
    console.log(`generated game id: ${generateGameIdTx}`);

    const balance1 = await rps.connect(addr1).balanceOf(addr1.address);
    console.log(`account 1 balance: ${balance1}`);

    const balance2 = await rps.connect(addr2).balanceOf(addr2.address);
    console.log(`account 2 balance: ${balance2}`);

    const createGameTx = await rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 60, 200, true);

    // wait until the transaction is mined
    await createGameTx.wait();

    const balance1PostGameCreate = await rps.connect(addr1).balanceOf(addr1.address);
    console.log(`account 1 balance post game create: ${balance1PostGameCreate}`);

    const joinGameTx = await rps.connect(addr2).joinGame(generateGameIdTx, 2, 200, true);

    // wait until the transaction is mined
    await joinGameTx.wait();

    const balance2PostGameJoin = await rps.connect(addr2).balanceOf(addr2.address);
    console.log(`account 2 balance post game join: ${balance2PostGameJoin}`);

    const revealMoveTx = await rps.connect(addr1).revealMove(1, bytes32({ input: "super secret!" }));

    // wait until the transaction is mined
    await revealMoveTx.wait();

    const balance1EndGame = await rps.connect(addr1).balanceOf(addr1.address);
    console.log(`account 1 balance end of game: ${balance1EndGame}`);

    const balance2EndGame = await rps.connect(addr2).balanceOf(addr2.address);
    console.log(`account 2 balance end of game: ${balance2EndGame}`);

    expect(balance1EndGame).to.equal(0);
    expect(balance2EndGame).to.equal(400);
});

it("Should return wagers to player accounts if the game payoff is a tie.", async function () {
    const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
    const rps = await RockPaperScissors.deploy("RockPaperScissors", "RPS", 100);
    await rps.deployed();

    const [, addr1, addr2] = await ethers.getSigners();

    // transfer from owner to addr1
    const transfer1TokenTx = await rps.transfer(addr1.address, 200);
    await transfer1TokenTx.wait();

    const transfer2TokenTx = await rps.transfer(addr2.address, 200);
    await transfer2TokenTx.wait();

    const generateGameIdTx = await rps.connect(addr1).generateGameId(3, bytes32({ input: "super secret!" }));

    // wait until the transaction is mined
    console.log(`generated game id: ${generateGameIdTx}`);

    const balance1 = await rps.connect(addr1).balanceOf(addr1.address);
    console.log(`account 1 balance: ${balance1}`);

    const balance2 = await rps.connect(addr2).balanceOf(addr2.address);
    console.log(`account 2 balance: ${balance2}`);

    const createGameTx = await rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 60, 200, true);

    // wait until the transaction is mined
    await createGameTx.wait();

    const balance1PostGameCreate = await rps.connect(addr1).balanceOf(addr1.address);
    console.log(`account 1 balance post game create: ${balance1PostGameCreate}`);

    const joinGameTx = await rps.connect(addr2).joinGame(generateGameIdTx, 3, 200, true);

    // wait until the transaction is mined
    await joinGameTx.wait();

    const balance2PostGameJoin = await rps.connect(addr2).balanceOf(addr2.address);
    console.log(`account 2 balance post game join: ${balance2PostGameJoin}`);

    const revealMoveTx = await rps.connect(addr1).revealMove(3, bytes32({ input: "super secret!" }));

    // wait until the transaction is mined
    await revealMoveTx.wait();

    const balance1EndGame = await rps.connect(addr1).balanceOf(addr1.address);
    console.log(`account 1 balance end of game: ${balance1EndGame}`);

    const balance2EndGame = await rps.connect(addr2).balanceOf(addr2.address);
    console.log(`account 2 balance end of game: ${balance2EndGame}`);

    expect(balance1EndGame).to.equal(200);
    expect(balance2EndGame).to.equal(200);
});