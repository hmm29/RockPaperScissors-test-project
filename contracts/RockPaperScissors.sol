//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RockPaperScissors
 * @author Harrison Miller (https://github.com/hmm29)
 * @notice Play RockPaperScissors with another user on Ethereum
 * @dev Implementation of RockPaperScissors game using ERC20 (OpenZeppelin)
 */
contract RockPaperScissors is ERC20, Ownable {
    enum Shape {
        NONE,
        ROCK,
        PAPER,
        SCISSORS
    }
    enum Payoff {
        NONE,
        TIE,
        PLAYER,
        OPPONENT,
        CLAIMED
    }

    struct Game {
        address player;
        address opponent;
        Shape opponentMove;
        Payoff payoff;
        uint256 playerWager;
        uint256 opponentWager;
        uint256 deadline;
    }

    struct Player {
        uint32 totalGames;
        uint32 wins;
        uint32 losses;
        uint32 ties;
        uint256 winnings;
    }

    mapping(bytes32 => Game) public games;
    mapping(address => Player) public players;

    uint256 public feeInTokens;
    uint256 public secondsLeftToReveal;

    uint256 MIN_SECONDS_LEFT_TO_REVEAL = 60; // 1 minute -> seconds
    uint256 MAX_SECONDS_LEFT_TO_REVEAL = 3600; // 1 hour -> seconds
    uint256 MIN_SECONDS_LEFT_TO_JOIN = 3600; // 1 hour -> seconds
    uint256 MAX_SECONDS_LEFT_TO_JOIN = 432000; // 5 days -> seconds

    event SecondsLeftToRevealUpdated(
        address indexed sender,
        uint256 secondsLeftToReveal
    );
    event MoveRevealed(
        address indexed sender,
        bytes32 indexed gameId,
        Shape playerMove,
        Payoff payoff
    );
    event GameCreated(
        address indexed player,
        bytes32 indexed gameId,
        address indexed opponent,
        uint256 playerWager,
        uint256 deadlineToJoin
    );
    event GameJoined(
        bytes32 gameId,
        Shape opponentMove,
        uint256 opponentWager,
        uint256 deadlineToReveal
    );
    event GameCancelled(address indexed sender, bytes32 indexed gameId);
    event TotalWageredClaimed(address indexed sender, bytes32 indexed gameId);
    event KillContract(address indexed owner);

    /**
     * @dev Sets the values for {name}, {symbol}, and {feeInTokens}.
     *
     * The decimals() function of ERC20 has been overriden so the value is 0.
     * For this game, there will only be full tokens, similar to an arcade.
     *
     * {name} and {symbol} are immutable. {feeInTokens} can be updated later
     * if owner changes his or her mind.
     * @param _name Name of the contract
     * @param _symbol Symbol of the token for this game
     * @param _feeInTokens The deposit a player must make in order to enroll
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _feeInTokens
    ) ERC20(_name, _symbol) {
        console.log(
            "Deploying a RockPaperScissors contract with name %s, symbol %s, _feeInTokens %d",
            _name,
            _symbol,
            _feeInTokens
        );
        _mint(msg.sender, 1_000_000_000 * (10**decimals()));
        _setFeeInTokens(_feeInTokens);
        _setSecondsLeftToReveal(300);
    }

    /**
     * @dev Overrides decimals() function of ERC20 parent contract so that tokens have single denomination and are indivisible.
     * @return constant value of 0
     */
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /**
     * @dev Allow external calls to update the game enrollment fee. Only the owner of the contract can do this.
     * @param _feeInTokens The fee in tokens a player needs to deposit to enroll
     */
    function setFeeInTokens(uint256 _feeInTokens) external onlyOwner {
        _setFeeInTokens(_feeInTokens);
    }

    /**
     * @dev Update how much time left until players' moves are revealed in the * game. This builds anticipation for the payoff throughout the game.
     * @param _secondsLeftToReveal Seconds left until revealing player's move
     */
    function setSecondsLeftToReveal(uint256 _secondsLeftToReveal) external onlyOwner {
        _setSecondsLeftToReveal(_secondsLeftToReveal);
    }

    /**
     * @dev Players can access each game via a unique key, which is a hash derived from the inputs that the game creator provided.
     * @param move The player's selected move
     * @param secret A secret added to generate the unique hash
     * @return hashedMove A hash derived from the player's move, used as the game ID.
     */
    function generateGameId(
        Shape move,
        bytes32 secret
    ) public view returns (bytes32 hashedMove) {
        require(msg.sender != address(0), "Invalid sender address.");
        require(move != Shape.NONE, "NONE is not a valid move.");
        hashedMove = keccak256(abi.encodePacked(this, msg.sender, move, secret));
    }

    /**
     * @dev The player creates a game by submitting his hashed move, i.e., the * gameId. Allows player to set 'exploding' games that opponent has limited * time to join.
     * @param gameId The unique ID for the game
     * @param opponent The address of the selected opponent for the game
     * @param secondsLeftToJoin Amount of time in seconds opponent has left to join the game
     * @param wager Amount of tokens bet by the player
     * @param useWinnings A flag that lets player override wager amount and use previous winnings
     */
    function createGame(
        bytes32 gameId,
        address opponent,
        uint256 secondsLeftToJoin,
        uint256 wager,
        bool useWinnings
    ) public {
        require(balanceOf(msg.sender) >= feeInTokens, "Insufficient token balance to create a game.");
        require(opponent != address(0), "Not a valid opponent address.");
        require(opponent != msg.sender, "Not a valid opponent; players cannot play against themselves.");

        require(
            MIN_SECONDS_LEFT_TO_JOIN <= secondsLeftToJoin &&
                secondsLeftToJoin <= MAX_SECONDS_LEFT_TO_JOIN,
            "Please ensure the time left to join the game is between the acceptable min (3600) and max (432000) values."
        );

        Game storage game = games[gameId];
        require(game.player == address(0), "This game already exists. Use a different secret and generate a new gameId.");

        game.player = msg.sender;
        game.opponent = opponent;

        wager = _getWager(msg.sender, wager, useWinnings);

        // Move player's wagered amount to smart contract
        transfer(address(this), wager);
        game.playerWager = wager;
    
        // Set the deadline for the opponent to join the game
        uint256 deadlineToJoin = block.timestamp + secondsLeftToJoin;
        game.deadline = deadlineToJoin;

        emit GameCreated(msg.sender, gameId, opponent, wager, deadlineToJoin);
    }

    /**
     * @dev The opponent joins the game by providing the gameId, their move, and their wager details.
     * @param gameId The unique ID for the game
     * @param move The opponent's move for this game
     * @param wager Amount of tokens bet by the player
     * @param useWinnings A flag that lets player override wager amount and use
     */
    function joinGame(
        bytes32 gameId,
        Shape move,
        uint256 wager,
        bool useWinnings
    ) public {
        require(balanceOf(msg.sender) >= feeInTokens, "Insufficient token balance to join the game.");
        require(move != Shape.NONE, "NONE is not a valid move.");

        Game storage game = games[gameId];
        require(
            game.player != address(0),
            "This game does not exist."
        );

        address opponent = game.opponent;
        require(
            opponent == msg.sender,
            "The sender's address is not the opponent address specified by the game creator."
        );

        require(
            game.opponentMove == Shape.NONE,
            "The opponent is already participating in this game."
        );
        require(
            block.timestamp <= game.deadline,
            "The deadline to join this game has already expired."
        );

        game.opponentMove = move;

        wager = _getWager(msg.sender, wager, useWinnings);

        // Move opponent's wagered amount to smart contract
        transfer(address(this), wager);
        game.opponentWager = wager;

        // Set the deadline for the move reveal
        uint256 deadlineToReveal = block.timestamp + secondsLeftToReveal;
        game.deadline = deadlineToReveal;

        emit GameJoined(gameId, move, wager, deadlineToReveal);
    }

    /**
     * @dev The player reveals the hashed move providing the plain text move and its secret.
     * @param move Move
     * @param secret Secret used to regenerate gameId, reveal the player's move, and execute final game logic
     */
    function revealMove(Shape move, bytes32 secret) public {
        bytes32 gameId = generateGameId(move, secret);

        Game storage game = games[gameId];
        address player = game.player;
        require(player != address(0), "Player move or secret argument incorrect: game does not exist.");

        Shape opponentMove = game.opponentMove;
        require(opponentMove != Shape.NONE, "The opponent has not yet joined the game.");

        console.log("Block timestamp is %d", block.timestamp);
        console.log("Game deadline is %d", game.deadline);

        require(block.timestamp <= game.deadline, "The deadline for the reveal has expired. The opponent may or may not claim the total amount wagered.");

        uint256 playerWager = game.playerWager;
        uint256 opponentWager = game.opponentWager;
        uint256 totalWagered = playerWager + opponentWager;

        address opponent = game.opponent;

        Payoff payoff = Payoff(((3 + uint256(move) - uint256(opponentMove)) % 3)+1);
        game.payoff = payoff;

        if (payoff == Payoff.TIE) {
            _payTo(player, playerWager);
            _payTo(opponent, opponentWager);
            players[player].ties++;
            players[opponent].ties++;

        }
        else if (payoff == Payoff.PLAYER) {
            _payTo(player, totalWagered);
            players[player].wins++;
            players[player].winnings += totalWagered;
            players[opponent].losses++;
        }
        else if (payoff == Payoff.OPPONENT) {
            _payTo(opponent, totalWagered);
            players[opponent].wins++;
            players[opponent].winnings += totalWagered;
            players[player].losses++;
        }
        else {
            assert(false);
        }

        players[player].totalGames++;
        players[opponent].totalGames++;

        emit MoveRevealed(msg.sender, gameId, move, payoff);
    }

    /**
     * @dev If the opponent doesn't join the game before the deadline to join, the player can cancel the game.
     * @param gameId ID of the game to be cancelled
     */
    function cancelGame(bytes32 gameId) public {
        Game storage game = games[gameId];
        address player = game.player;

        require(player != address(0), "This game does not exist.");
        require(player == msg.sender, "Player is not player for this game; not permitted to cancel the game.");
        require(game.opponentMove == Shape.NONE, "Unable to cancel; the opponent is already participating in this game.");
        require(game.deadline < block.timestamp, "Deadline for join has not yet expired.");

        uint256 playerWager = game.playerWager;
        _clearGame(gameId);

        if (playerWager > 0) {
            _payTo(player, playerWager);
        }

        emit GameCancelled(msg.sender, gameId);
    }

    /**
     * @dev In cases where the player doesn't reveal his move, the opponent can claim the total amount wagered. The player is penalized for being uncooperative. These are not counted as winnings since the game didn't complete.
     * @param gameId ID of the game
     */
    function claimTotalWagered(bytes32 gameId) public {
        Game storage game = games[gameId];
        
        require(game.player != address(0), "This game does not exist");
        require(game.opponentMove != Shape.NONE, "Opponent has not yet joined the game.");
        require(game.deadline < block.timestamp, "The deadline for reveal for this game has not yet expired.");

        uint256 totalWagered = game.playerWager + game.opponentWager;
        address opponent = game.opponent;
        game.payoff = Payoff.CLAIMED;

        if (totalWagered > 0) {
            _payTo(opponent, totalWagered);
        }

        emit TotalWageredClaimed(msg.sender, gameId);
    }

    /**
     * @dev Internal function for payoff payouts from the contract account
     * @param recipient Recipient of the payout
     * @param amount Amount paid out
     */
    function _payTo(address recipient, uint256 amount) internal {
         ERC20(address(this)).transfer(recipient, amount);
    }

    /**
     * @dev Clears game if it was cancelled by the player. Leaves player field so that game is not reused and player who cancelled is known. Leaves default value for payoff (0) since game was never finished.
     * @param gameId ID of the game
     */    
    function _clearGame(bytes32 gameId) internal {
        Game storage game = games[gameId];
        game.opponent = address(0);
        game.opponentMove = Shape.NONE;
        game.playerWager = 0;
        game.opponentWager = 0;
        game.deadline = 0;
    }

    /**
     * @dev Helper function for figuring out a player's wager.
     * Allows player to bet previous winnings.
     * @param player Address of player with wager
     * @param wager Amount of tokens bet by the player
     * @param useWinnings A flag that lets player override wager amount and use previous winnings
     * @return finalWager The player's final wager
     */
    function _getWager(
        address player,
        uint256 wager,
        bool useWinnings
    ) internal view returns (uint256 finalWager) {
        require(
                wager <= balanceOf(player),
                "Player doesn't have enough tokens for this wagered amount."
            );

        finalWager = wager;

        if (useWinnings) {
            if(players[player].winnings > 0 &&
            balanceOf(player) >= players[player].winnings) {
                finalWager = players[player].winnings;
            }
        }
    }

    /**
     * @dev Internal function to update feeInTokens.
     * @param _feeInTokens The fee in tokens a player needs to deposit to enroll
     */
    function _setFeeInTokens(uint256 _feeInTokens) internal {
        require(_feeInTokens >= 0, "Token fee cannot be less than 0.");
        console.log(
            "Changing feeInTokens from '%d' to '%d'",
            feeInTokens,
            _feeInTokens
        );
        feeInTokens = _feeInTokens;
    }

    /**
     * @dev Internal function to update secondsLeftToReveal.
     * @param _secondsLeftToReveal Seconds left for player to reveal move to opponent
     */
    function _setSecondsLeftToReveal(uint256 _secondsLeftToReveal) internal {
        require(
            MIN_SECONDS_LEFT_TO_REVEAL <= _secondsLeftToReveal &&
                _secondsLeftToReveal <= MAX_SECONDS_LEFT_TO_REVEAL,
            "Please ensure secondsLeftToReveal is between the acceptable min (60) and max (3600) values."
        );
        secondsLeftToReveal = _secondsLeftToReveal;
        emit SecondsLeftToRevealUpdated(msg.sender, _secondsLeftToReveal);
    }

    /**
     * @dev Destroy the contract
     */ 
    function kill() public onlyOwner {
        address payable owner = payable(owner());

        emit KillContract(owner);
        selfdestruct(owner);
    }
}