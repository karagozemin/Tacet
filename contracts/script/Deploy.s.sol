// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {TacetRound} from "../src/TacetRound.sol";
import {TacetToken} from "../src/TacetToken.sol";

contract DeployTacet is Script {
    function run() external returns (address token, address round) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);

        TacetToken t = new TacetToken();
        TacetRound r = new TacetRound(address(t));

        vm.stopBroadcast();
        return (address(t), address(r));
    }
}
