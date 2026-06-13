// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TacetToken — demo ERC-20 for sealed round escrow on Arbitrum Sepolia.
/// @dev Not a production asset. Minted freely for hackathon demos.
contract TacetToken is ERC20 {
    constructor() ERC20("Tacet Demo Token", "TACET") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
