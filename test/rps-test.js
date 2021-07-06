const { expect } = require("chai");
const { ethers } = require("hardhat");
const bytes32 = require('bytes32');

describe("RockPaperScissors", function () {
    beforeEach(async function () {
        const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
        const rps = await RockPaperScissors.deploy("RockPaperScissors", "RPS", 100);
        this.currentTest.rps = rps;
        await rps.deployed();
    });

    it("Should return the name, symbol, and feeInTokens.", async function () {
        expect(await this.test.rps.name()).to.equal("RockPaperScissors");
        expect(await this.test.rps.symbol()).to.equal("RPS");
        expect(await this.test.rps.feeInTokens()).to.equal(100);
    });

    it("Should allow owner to change fee in tokens.", async function () {        
        const setFeeInTokensTx = await this.test.rps.setFeeInTokens(81);

        await setFeeInTokensTx.wait();

        expect(await this.test.rps.feeInTokens()).to.equal(81);
    });

    it("Should allow player with sufficient balance to create a game after contract creation.", async function () {
        const generateGameIdTx = await this.test.rps.generateGameId(1, bytes32({ input: "super secret!" }));

        console.log(`generated game id: ${generateGameIdTx}`);

        const [owner, addr1] = await ethers.getSigners();

        const balance = await this.test.rps.balanceOf(owner.address);
        console.log(`balance: ${balance}`);

        const createGameTx = await this.test.rps.createGame(generateGameIdTx, addr1.address, 3600, 12, false);

        await createGameTx.wait();

        const [, opponent] = await this.test.rps.games(generateGameIdTx);
        expect(opponent).to.equal(addr1.address);
    });

    it("Should prevent player from creating game if they have an insufficient balance.", async function () {
        const [, addr1, addr2] = await ethers.getSigners();

        try {
            const generateGameIdTx = await this.test.rps.connect(addr1).generateGameId(1, bytes32({ input: "super secret!" }));

            console.log(`generated game id: ${generateGameIdTx}`);

            const balance = await this.test.rps.connect(addr1).balanceOf(addr1.address);
            console.log(`account 1 balance: ${balance}`);

            const createGameTx = await this.test.rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 3600, 12, false);

            await createGameTx.wait();
        } catch (error) {
            expect(error.message, 'test revert [transaction execution reverts if insufficient balance]').to.equal("VM Exception while processing transaction: reverted with reason string 'Insufficient token balance to create a game.'");
        }
    });

    it("Should only allow players to create games with other players.", async function () {
        const [, addr1] = await ethers.getSigners();

        const transfer1TokenTx = await this.test.rps.transfer(addr1.address, 200);
        await transfer1TokenTx.wait();

        const generateGameIdTx = await this.test.rps.connect(addr1).generateGameId(3, bytes32({ input: "super secret!" }));

        console.log(`generated game id: ${generateGameIdTx}`);

        try {
            const createGameTx = await this.test.rps.connect(addr1).createGame(generateGameIdTx, addr1.address, 3600, 200, true);

            await createGameTx.wait();
        } catch (error) {
            expect(error.message, 'test revert [players cannot play themselves]').to.equal("VM Exception while processing transaction: reverted with reason string 'Not a valid opponent; players cannot play against themselves.'");
        }
    });

    it("Should prevent players from setting unreasonable join windows for opponents.", async function () {
        const [, addr1, addr2] = await ethers.getSigners();

        const transfer1TokenTx = await this.test.rps.transfer(addr1.address, 200);
        await transfer1TokenTx.wait();

        const generateGameIdTx = await this.test.rps.connect(addr1).generateGameId(3, bytes32({ input: "super secret!" }));

        console.log(`generated game id: ${generateGameIdTx}`);

        try {
            const createGameTx = await this.test.rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 10, 200, true);

            await createGameTx.wait();
        } catch (error) {
            expect(error.message, 'test revert [minutes left to join]').to.equal("VM Exception while processing transaction: reverted with reason string 'Please ensure the time left to join the game is between the acceptable min (3600) and max (432000) values.'");
        }
    });

    it("Should prevent player from using a wager that exceeds that player's balance.", async function () {
        const [, addr1, addr2] = await ethers.getSigners();

        const transferTokenTx = await this.test.rps.transfer(addr1.address, 200);
        await transferTokenTx.wait();

        try {
            const generateGameIdTx = await this.test.rps.connect(addr1).generateGameId(1, bytes32({ input: "super secret!" }));

            console.log(`generated game id: ${generateGameIdTx}`);

            const balance = await this.test.rps.connect(addr1).balanceOf(addr1.address);
            console.log(`account 1 balance: ${balance}`);

            const createGameTx = await this.test.rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 3600, 400, false);

            await createGameTx.wait();
        } catch (error) {
            expect(error.message, 'test revert [wager amount exceeds balance]').to.equal("VM Exception while processing transaction: reverted with reason string 'Player doesn't have enough tokens for this wagered amount.'");
        }
    });

    it("Should prevent players from cancelling games that are not theirs.", async function () {
        const [, addr1, addr2] = await ethers.getSigners();

        const transferTokenTx = await this.test.rps.transfer(addr1.address, 200);
        await transferTokenTx.wait();

        try {
            const generateGameIdTx = await this.test.rps.connect(addr1).generateGameId(1, bytes32({ input: "super secret!" }));

            console.log(`generated game id: ${generateGameIdTx}`);

            const balance = await this.test.rps.connect(addr1).balanceOf(addr1.address);
            console.log(`account 1 balance: ${balance}`);

            const createGameTx = await this.test.rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 3600, 10, false);

            await createGameTx.wait();

            // account 2 attempts to cancel the game with this ID
            const cancelGameTx = await this.test.rps.connect(addr2).cancelGame(generateGameIdTx);

            await cancelGameTx.wait();
        } catch (error) {
            expect(error.message, 'test revert [players can only cancel their games]').to.equal("VM Exception while processing transaction: reverted with reason string 'Player is not player for this game; not permitted to cancel the game.'");
        }
    });

    it("Should prevent players from cancelling games before the opponent can join.", async function () {
        const [, addr1, addr2] = await ethers.getSigners();

        const transferTokenTx = await this.test.rps.transfer(addr1.address, 200);
        await transferTokenTx.wait();

        try {
            const generateGameIdTx = await this.test.rps.connect(addr1).generateGameId(1, bytes32({ input: "super secret!" }));

            console.log(`generated game id: ${generateGameIdTx}`);

            const balance = await this.test.rps.connect(addr1).balanceOf(addr1.address);
            console.log(`account 1 balance: ${balance}`);

            const createGameTx = await this.test.rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 3600, 10, false);

            await createGameTx.wait();

            const cancelGameTx = await this.test.rps.connect(addr1).cancelGame(generateGameIdTx);

            await cancelGameTx.wait();
        } catch (error) {
            expect(error.message, 'test revert [players can only cancel their games]').to.equal("VM Exception while processing transaction: reverted with reason string 'Deadline for join has not yet expired.'");
        }
    });

    it("Should allow players to play Rock Paper Scissors together.", async function () {
        const [, addr1, addr2] = await ethers.getSigners();

        const transfer1TokenTx = await this.test.rps.transfer(addr1.address, 200);
        await transfer1TokenTx.wait();

        const transfer2TokenTx = await this.test.rps.transfer(addr2.address, 200);
        await transfer2TokenTx.wait();

        const generateGameIdTx = await this.test.rps.connect(addr1).generateGameId(1, bytes32({ input: "super secret!" }));

        console.log(`generated game id: ${generateGameIdTx}`);

        const balance1 = await this.test.rps.connect(addr1).balanceOf(addr1.address);
        console.log(`account 1 balance: ${balance1}`);

        const balance2 = await this.test.rps.connect(addr2).balanceOf(addr2.address);
        console.log(`account 2 balance: ${balance2}`);

        const createGameTx = await this.test.rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 3600, 100, false);

        await createGameTx.wait();

        const balance1PostGameCreate = await this.test.rps.connect(addr1).balanceOf(addr1.address);
        console.log(`account 1 balance post game create: ${balance1PostGameCreate}`);

        const joinGameTx = await this.test.rps.connect(addr2).joinGame(generateGameIdTx, 2, 100, false);

        await joinGameTx.wait();

        const balance2PostGameJoin = await this.test.rps.connect(addr2).balanceOf(addr2.address);
        console.log(`account 2 balance post game join: ${balance2PostGameJoin}`);

        const revealMoveTx = await this.test.rps.connect(addr1).revealMove(1, bytes32({ input: "super secret!" }));

        await revealMoveTx.wait();

        const balance1EndGame = await this.test.rps.connect(addr1).balanceOf(addr1.address);
        console.log(`account 1 balance end of game: ${balance1EndGame}`);

        const balance2EndGame = await this.test.rps.connect(addr2).balanceOf(addr2.address);
        console.log(`account 2 balance end of game: ${balance2EndGame}`);

        expect(balance1EndGame).to.equal(100);
        expect(balance2EndGame).to.equal(300);
    });

    it("Should allow players to play Rock Paper Scissors together and wager all their winnings.", async function () {
        const [, addr1, addr2] = await ethers.getSigners();

        const transfer1TokenTx = await this.test.rps.transfer(addr1.address, 200);
        await transfer1TokenTx.wait();

        const transfer2TokenTx = await this.test.rps.transfer(addr2.address, 200);
        await transfer2TokenTx.wait();

        const generateGameIdTx = await this.test.rps.connect(addr1).generateGameId(1, bytes32({ input: "super secret!" }));

        console.log(`generated game id: ${generateGameIdTx}`);

        const balance1 = await this.test.rps.connect(addr1).balanceOf(addr1.address);
        console.log(`account 1 balance: ${balance1}`);

        const balance2 = await this.test.rps.connect(addr2).balanceOf(addr2.address);
        console.log(`account 2 balance: ${balance2}`);

        const createGameTx = await this.test.rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 3600, 200, true);

        await createGameTx.wait();

        const balance1PostGameCreate = await this.test.rps.connect(addr1).balanceOf(addr1.address);
        console.log(`account 1 balance post game create: ${balance1PostGameCreate}`);

        const joinGameTx = await this.test.rps.connect(addr2).joinGame(generateGameIdTx, 2, 200, true);

        await joinGameTx.wait();

        const balance2PostGameJoin = await this.test.rps.connect(addr2).balanceOf(addr2.address);
        console.log(`account 2 balance post game join: ${balance2PostGameJoin}`);

        const revealMoveTx = await this.test.rps.connect(addr1).revealMove(1, bytes32({ input: "super secret!" }));

        await revealMoveTx.wait();

        const balance1EndGame = await this.test.rps.connect(addr1).balanceOf(addr1.address);
        console.log(`account 1 balance end of game: ${balance1EndGame}`);

        const balance2EndGame = await this.test.rps.connect(addr2).balanceOf(addr2.address);
        console.log(`account 2 balance end of game: ${balance2EndGame}`);

        expect(balance1EndGame).to.equal(0);
        expect(balance2EndGame).to.equal(400);
    });

    it("Should return wagers to player accounts if the game payoff is a tie.", async function () {
        const [, addr1, addr2] = await ethers.getSigners();

        const transfer1TokenTx = await this.test.rps.transfer(addr1.address, 200);
        await transfer1TokenTx.wait();

        const transfer2TokenTx = await this.test.rps.transfer(addr2.address, 200);
        await transfer2TokenTx.wait();

        const generateGameIdTx = await this.test.rps.connect(addr1).generateGameId(3, bytes32({ input: "super secret!" }));

        console.log(`generated game id: ${generateGameIdTx}`);

        const balance1 = await this.test.rps.connect(addr1).balanceOf(addr1.address);
        console.log(`account 1 balance: ${balance1}`);

        const balance2 = await this.test.rps.connect(addr2).balanceOf(addr2.address);
        console.log(`account 2 balance: ${balance2}`);

        const createGameTx = await this.test.rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 3600, 200, true);

        await createGameTx.wait();

        const balance1PostGameCreate = await this.test.rps.connect(addr1).balanceOf(addr1.address);
        console.log(`account 1 balance post game create: ${balance1PostGameCreate}`);

        const joinGameTx = await this.test.rps.connect(addr2).joinGame(generateGameIdTx, 3, 200, true);

        await joinGameTx.wait();

        const balance2PostGameJoin = await this.test.rps.connect(addr2).balanceOf(addr2.address);
        console.log(`account 2 balance post game join: ${balance2PostGameJoin}`);

        const revealMoveTx = await this.test.rps.connect(addr1).revealMove(3, bytes32({ input: "super secret!" }));

        await revealMoveTx.wait();

        const balance1EndGame = await this.test.rps.connect(addr1).balanceOf(addr1.address);
        console.log(`account 1 balance end of game: ${balance1EndGame}`);

        const balance2EndGame = await this.test.rps.connect(addr2).balanceOf(addr2.address);
        console.log(`account 2 balance end of game: ${balance2EndGame}`);

        expect(balance1EndGame).to.equal(200);
        expect(balance2EndGame).to.equal(200);
    });

    it("Should only allow opponent to claim if secondsUntilReveal has elapsed.", async function () {
        const [, addr1, addr2] = await ethers.getSigners();

        const transfer1TokenTx = await this.test.rps.transfer(addr1.address, 200);
        await transfer1TokenTx.wait();

        const transfer2TokenTx = await this.test.rps.transfer(addr2.address, 200);
        await transfer2TokenTx.wait();

        const generateGameIdTx = await this.test.rps.connect(addr1).generateGameId(3, bytes32({ input: "super secret!" }));

        console.log(`generated game id: ${generateGameIdTx}`);

        const balance1 = await this.test.rps.connect(addr1).balanceOf(addr1.address);
        console.log(`account 1 balance: ${balance1}`);

        const balance2 = await this.test.rps.connect(addr2).balanceOf(addr2.address);
        console.log(`account 2 balance: ${balance2}`);

        const createGameTx = await this.test.rps.connect(addr1).createGame(generateGameIdTx, addr2.address, 3600, 200, true);

        await createGameTx.wait();

        const balance1PostGameCreate = await this.test.rps.connect(addr1).balanceOf(addr1.address);
        console.log(`account 1 balance post game create: ${balance1PostGameCreate}`);

        const joinGameTx = await this.test.rps.connect(addr2).joinGame(generateGameIdTx, 3, 200, true);

        await joinGameTx.wait();

        const balance2PostGameJoin = await this.test.rps.connect(addr2).balanceOf(addr2.address);
        console.log(`account 2 balance post game join: ${balance2PostGameJoin}`);

        try {
            const claimTotalWageredTx = await this.test.rps.connect(addr2).claimTotalWagered(generateGameIdTx);

            await claimTotalWageredTx.wait();
        } catch (error) {
            expect(error.message, 'test revert [can only claim if secondsUntilReveal has elapsed]').to.equal("VM Exception while processing transaction: reverted with reason string 'The deadline for reveal for this game has not yet expired.'");
        }
    });

    it("Should only allow owner to destroy the contract.", async function () {
        const killTx = await this.test.rps.kill();
        await killTx.wait();

        const rpsCode = await ethers.getDefaultProvider().getCode(this.test.rps.address);
        expect(rpsCode).to.equal('0x');
    });

    it("Should not let non-owner destroy the contract.", async function () {
        const [, addr1] = await ethers.getSigners();

        try {
            const killTx = await this.test.rps.connect(addr1).kill();
            await killTx.wait();
        } catch (error) {
            expect(error.message, 'test revert [only owner can destroy contract]').to.equal("VM Exception while processing transaction: reverted with reason string 'Ownable: caller is not the owner'");
        }
    });
});