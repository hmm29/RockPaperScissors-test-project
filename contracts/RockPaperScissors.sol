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
    uint256 public secondsUntilReveal;

    uint256 MIN_SECONDS_UNTIL_REVEAL = 60; // 1 minute -> seconds
    uint256 MAX_SECONDS_UNTIL_REVEAL = 3600; // 1 hour -> seconds
    uint256 MIN_SECONDS_LEFT_TO_JOIN = 3600; // 1 hour -> seconds
    uint256 MAX_SECONDS_LEFT_TO_JOIN = 432000; // 5 days -> seconds

    event SecondsUntilRevealUpdated(
        address indexed sender,
        uint256 secondsUntilReveal
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
     */
    function setSecondsUntilReveal(uint256 _secondsUntilReveal) public onlyOwner {
        require(
            MIN_SECONDS_UNTIL_REVEAL <= _secondsUntilReveal &&
                _secondsUntilReveal <= MAX_SECONDS_UNTIL_REVEAL,
            "Please ensure the reveal timer duration is between the acceptable min (60) and max (3600) values."
        );
        secondsUntilReveal = _secondsUntilReveal;
        emit SecondsUntilRevealUpdated(msg.sender, _secondsUntilReveal);
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
        require(move != Shape.NONE, "NONE is not an allowed move.");
        hashedMove = keccak256(abi.encodePacked(this, msg.sender, move, secret));
    }

    /**
     * @dev The player creates a game by submitting his hashed move, i.e., the * gameId. Allows player to set 'exploding' games that opponent has limited * time to join.
     * @param gameId The unique ID for the game
     * @param opponent The address of the selected opponent for the game
     * @param minutesLeftToJoin Amount of time opponent has left to join the game
     * @param wager Amount of tokens bet by the player
     * @param useWinnings A flag that lets player override wager amount and use previous winnings
     */
    function createGame(
        bytes32 gameId,
        address opponent,
        uint256 minutesLeftToJoin,
        uint256 wager,
        bool useWinnings
    ) public {
        require(balanceOf(msg.sender) >= feeInTokens, "Insufficient token balance to create a new game.");
        require(opponent != address(0), "Not a valid opponent address.");

        uint256 secondsLeftToJoin = minutesLeftToJoin*60;
        require(
            MIN_SECONDS_LEFT_TO_JOIN <= secondsLeftToJoin &&
                secondsLeftToJoin <= MAX_SECONDS_LEFT_TO_JOIN,
            "Please ensure the time left to join the game is between the acceptable min (60 min) and max (7200 min) values."
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
        require(balanceOf(msg.sender) >= feeInTokens, "Insufficient token balance to join a game.");
        require(move != Shape.NONE, "NONE is not an allowed move.");

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
        uint256 deadlineToReveal = block.timestamp + secondsUntilReveal;
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
        require(player != address(0), "This game does not exist");

        Shape opponentMove = game.opponentMove;
        require(opponentMove != Shape.NONE, "The opponent has not yet joined the game.");

        require(block.timestamp <= game.deadline, "The deadline for the reveal has expired. The opponent may or may not claim the total amount wagered.");

        uint256 playerWager = game.playerWager;
        uint256 opponentWager = game.opponentWager;
        uint256 totalWagered = playerWager + opponentWager;

        address opponent = game.opponent;

        Payoff payoff = Payoff((4 + uint256(move) - uint256(opponentMove)) % 3);
        game.payoff = payoff;

        if (payoff == Payoff.TIE) {
            transfer(player, playerWager);
            transfer(opponent, opponentWager);
            players[player].ties++;
            players[opponent].ties++;

        }
        else if (payoff == Payoff.PLAYER) {
            transfer(player, totalWagered);
            players[player].wins++;
            players[player].winnings += totalWagered;
            players[opponent].losses++;
        }
        else if (payoff == Payoff.OPPONENT) {
            transfer(opponent, totalWagered);
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

        uint playerWager = game.playerWager;
        _clearGame(gameId);

        if (playerWager > 0) {
            transfer(player, playerWager);
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
            transfer(opponent, totalWagered);
        }

        emit TotalWageredClaimed(msg.sender, gameId);
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
        finalWager = wager;

        if (
            players[player].winnings > 0 &&
            balanceOf(player) >= players[player].winnings
        ) {
            if (useWinnings) {
                finalWager = players[player].winnings;
            }
        } else {
            require(
                wager <= balanceOf(player),
                "Player doesn't have enough tokens for this wagered amount."
            );
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
     * @dev Kill the contract
     */ 
    function kill() public onlyOwner {
        address payable owner = payable(owner());

        emit KillContract(owner);
        selfdestruct(owner);
    }
}