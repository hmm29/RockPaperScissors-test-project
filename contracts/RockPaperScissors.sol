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
abstract contract RockPaperScissors is ERC20, Ownable {
    enum Shape {
        NONE,
        ROCK,
        PAPER,
        SCISSORS
    }
    enum Payoff {
        TIE,
        PLAYER,
        OPPONENT
    }

    struct Game {
        address player;
        address opponent;
        Shape opponentMove;
        uint256 stake;
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
    uint256 private revealTimerDuration;
    uint256 private MIN_REVEAL_TIMER_DURATION = 1800; // 30 minutes in seconds
    uint256 private MAX_REVEAL_TIMER_DURATION = 3600; // 1 hour in seconds

    event RevealTimerDurationUpdate(
        address indexed sender,
        uint256 revealTimerDuration
    );
    event GameCreated(
        address indexed player,
        address indexed opponent,
        bytes32 indexed gameId,
        uint256 wager,
        uint256 deadlineToJoin
    );
    event GameJoined(
        Shape opponentMove,
        bytes32 gameId,
        uint256 opponentWager,
        uint256 deadlineToReveal
    );
    event MoveRevealed(
        address indexed sender,
        bytes32 indexed gameId,
        Shape playerMove,
        Payoff payoff
    );
    event GameCancelled(address indexed sender, bytes32 indexed gameId);
    event TokenWagerClaimed(address indexed sender, bytes32 indexed gameId);
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
            "Deploying a RockPaperScissors contract with name %s, symbol %s, _feeInTokens %u",
            _name,
            _symbol,
            _feeInTokens
        );
        _mint(msg.sender, 10000 * (10**decimals()));
        _setFeeInTokens(_feeInTokens);
    }

    /**
     * @dev Override decimals() function of ERC20 parent contract so that tokens have single denomination and are indivisible.
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
     * @dev Internal function to update feeInTokens.
     * @param _feeInTokens The fee in tokens a player needs to deposit to enroll
     */
    function _setFeeInTokens(uint256 _feeInTokens) internal {
        require(_feeInTokens >= 0, "Token fee cannot be less than 0.");
        console.log(
            "Changing greeting from '%u' to '%u'",
            feeInTokens,
            _feeInTokens
        );
        feeInTokens = _feeInTokens;
    }
}
