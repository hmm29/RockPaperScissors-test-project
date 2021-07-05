//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract RockPaperScissors {
    uint256 public feeInTokens;

    constructor(uint256 _feeInTokens) {
        console.log(
            "Deploying a RockPaperScissors with fee to play:",
            _feeInTokens
        );
        feeInTokens = _feeInTokens;
    }

    function setFeeInTokens(uint256 _feeInTokens) external {
        _setFeeInTokens(_feeInTokens);
    }

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
