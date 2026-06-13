// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TacetRound} from "../src/TacetRound.sol";
import {TacetToken} from "../src/TacetToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MaliciousToken is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    TacetRound public target;
    uint256 public attackCount;

    function setTarget(TacetRound t) external { target = t; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender];
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        if (attackCount < 1 && address(target) != address(0) && msg.sender == address(target)) {
            attackCount++;
            try target.settle(1) {} catch {}
        }
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function totalSupply() external pure returns (uint256) { return 0; }
    function decimals() external pure returns (uint8) { return 6; }
    function name() external pure returns (string memory) { return "MAL"; }
    function symbol() external pure returns (string memory) { return "MAL"; }
}

contract TacetRoundTest is Test {
    TacetRound internal round;
    TacetToken internal token;

    address internal operator = makeAddr("operator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal roundId;
    uint64 internal commitDeadline;
    uint64 internal revealDeadline;
    uint64 internal revealRound = 4_000_000;

    function setUp() public {
        token = new TacetToken();
        round = new TacetRound(address(token));

        commitDeadline = uint64(block.timestamp + 1 hours);
        revealDeadline = uint64(block.timestamp + 2 hours);

        vm.prank(operator);
        roundId = round.createRound(
            keccak256("item-ref"),
            revealRound,
            TacetRound.ClearingRule.HighestBid,
            commitDeadline,
            revealDeadline
        );

        token.mint(alice, 1_000_000e6);
        token.mint(bob, 1_000_000e6);
        token.mint(carol, 1_000_000e6);
    }

    function _commit(address bidder, uint128 value, uint128 escrow) internal returns (bytes32 nonce) {
        nonce = bytes32(uint256(keccak256(abi.encodePacked(bidder, value, block.timestamp))));
        bytes32 h = round.commitment(value, nonce);
        vm.startPrank(bidder);
        token.approve(address(round), escrow);
        round.commit(roundId, h, "cipher", "", escrow);
        vm.stopPrank();
    }

    function _openAndReveal(address bidder, uint128 value, bytes32 nonce) internal {
        round.reveal(roundId, bidder, value, nonce);
    }

    function test_fullLifecycle_highestBid() public {
        bytes32 nonceA = _commit(alice, 100e6, 150e6);
        bytes32 nonceB = _commit(bob, 200e6, 250e6);

        vm.warp(commitDeadline + 1);
        round.openReveal(roundId);

        _openAndReveal(alice, 100e6, nonceA);
        _openAndReveal(bob, 200e6, nonceB);

        vm.warp(revealDeadline + 1);
        (address winner, uint128 winningBid) = round.clear(roundId);
        assertEq(winner, bob);
        assertEq(winningBid, 200e6);

        uint256 opBefore = token.balanceOf(operator);
        uint256 bobBefore = token.balanceOf(bob);
        round.settle(roundId);

        assertEq(token.balanceOf(operator) - opBefore, 200e6);
        assertEq(token.balanceOf(bob) - bobBefore, 50e6); // surplus refund
        assertEq(token.balanceOf(alice), 1_000_000e6); // full refund

        (, , , , , , TacetRound.RoundStatus status, , ) = round.getRound(roundId);
        assertEq(uint8(status), uint8(TacetRound.RoundStatus.Settled));
    }

    function test_invalidDeadline() public {
        vm.prank(operator);
        vm.expectRevert(TacetRound.InvalidDeadline.selector);
        round.createRound(keccak256("x"), revealRound, TacetRound.ClearingRule.HighestBid, revealDeadline, commitDeadline);
    }

    function test_commitAfterDeadline() public {
        vm.warp(commitDeadline + 1);
        bytes32 h = round.commitment(1e6, bytes32(uint256(1)));
        vm.startPrank(alice);
        token.approve(address(round), 1e6);
        vm.expectRevert(TacetRound.CommitDeadlinePassed.selector);
        round.commit(roundId, h, "c", "", 1e6);
        vm.stopPrank();
    }

    function test_zeroEscrow() public {
        bytes32 h = round.commitment(1e6, bytes32(uint256(1)));
        vm.startPrank(alice);
        vm.expectRevert(TacetRound.ZeroEscrow.selector);
        round.commit(roundId, h, "c", "", 0);
        vm.stopPrank();
    }

    function test_wrongCommitmentReveal() public {
        _commit(alice, 100e6, 100e6);
        vm.warp(commitDeadline + 1);
        round.openReveal(roundId);
        vm.expectRevert(TacetRound.HashMismatch.selector);
        round.reveal(roundId, alice, 99e6, bytes32(uint256(2)));
    }

    function test_bidExceedsEscrowInvalid() public {
        bytes32 nonce = _commit(alice, 200e6, 100e6);
        vm.warp(commitDeadline + 1);
        round.openReveal(roundId);
        round.reveal(roundId, alice, 200e6, nonce);
        (, , , , bool valid, ) = round.getBidState(roundId, alice);
        assertFalse(valid);
    }

    function test_doubleReveal() public {
        bytes32 nonce = _commit(alice, 50e6, 50e6);
        vm.warp(commitDeadline + 1);
        round.openReveal(roundId);
        round.reveal(roundId, alice, 50e6, nonce);
        vm.expectRevert(TacetRound.AlreadyRevealed.selector);
        round.reveal(roundId, alice, 50e6, nonce);
    }

    function test_earlyReveal() public {
        bytes32 nonce = _commit(alice, 50e6, 50e6);
        vm.expectRevert();
        round.reveal(roundId, alice, 50e6, nonce);
    }

    function test_earlyClear() public {
        _commit(alice, 50e6, 50e6);
        vm.warp(commitDeadline + 1);
        round.openReveal(roundId);
        vm.expectRevert(TacetRound.RevealWindowClosed.selector);
        round.clear(roundId);
    }

    function test_doubleSettlement() public {
        bytes32 nonce = _commit(alice, 50e6, 50e6);
        vm.warp(commitDeadline + 1);
        round.openReveal(roundId);
        round.reveal(roundId, alice, 50e6, nonce);
        vm.warp(revealDeadline + 1);
        round.clear(roundId);
        round.settle(roundId);
        vm.expectRevert(TacetRound.AlreadySettled.selector);
        round.settle(roundId);
    }

    function test_timeoutVoidRefund() public {
        _commit(alice, 50e6, 50e6);
        vm.warp(uint256(revealDeadline) + round.VOID_GRACE_SECONDS() + 1);
        uint256 before = token.balanceOf(alice);
        round.voidRound(roundId);
        assertEq(token.balanceOf(alice) - before, 50e6);
        (, , , , , , TacetRound.RoundStatus status, , ) = round.getRound(roundId);
        assertEq(uint8(status), uint8(TacetRound.RoundStatus.Voided));
    }

    function test_noValidBidsVoidOnClear() public {
        bytes32 nonce = _commit(alice, 0, 50e6); // value 0 invalid at reveal
        vm.warp(commitDeadline + 1);
        round.openReveal(roundId);
        round.reveal(roundId, alice, 0, nonce);
        vm.warp(revealDeadline + 1);
        (address winner, ) = round.clear(roundId);
        assertEq(winner, address(0));
        assertEq(token.balanceOf(alice), 1_000_000e6);
    }

    function test_recommitRefundsPriorEscrow() public {
        bytes32 n1 = _commit(alice, 40e6, 40e6);
        bytes32 n2 = _commit(alice, 60e6, 60e6);
        assertEq(n1 != n2, true);
        (, uint128 escrow, , , , ) = round.getBidState(roundId, alice);
        assertEq(escrow, 60e6);
    }

    function test_tieBreakLowerAddress() public {
        address low = alice < bob ? alice : bob;
        address high = alice < bob ? bob : alice;
        bytes32 nLow = _commit(low, 100e6, 100e6);
        bytes32 nHigh = _commit(high, 100e6, 100e6);
        vm.warp(commitDeadline + 1);
        round.openReveal(roundId);
        round.reveal(roundId, low, 100e6, nLow);
        round.reveal(roundId, high, 100e6, nHigh);
        vm.warp(revealDeadline + 1);
        (address winner, ) = round.clear(roundId);
        assertEq(winner, low);
    }

    function test_lowestBidClearing() public {
        vm.prank(operator);
        uint256 rid = round.createRound(
            keccak256("low"),
            revealRound,
            TacetRound.ClearingRule.LowestBid,
            commitDeadline,
            revealDeadline
        );
        bytes32 nA = bytes32(uint256(11));
        bytes32 nB = bytes32(uint256(22));
        vm.startPrank(alice);
        token.approve(address(round), 200e6);
        round.commit(rid, round.commitment(150e6, nA), "c", "", 200e6);
        vm.stopPrank();
        vm.startPrank(bob);
        token.approve(address(round), 200e6);
        round.commit(rid, round.commitment(120e6, nB), "c", "", 200e6);
        vm.stopPrank();
        vm.warp(commitDeadline + 1);
        round.openReveal(rid);
        round.reveal(rid, alice, 150e6, nA);
        round.reveal(rid, bob, 120e6, nB);
        vm.warp(revealDeadline + 1);
        (address winner, uint128 winningBid) = round.clear(rid);
        assertEq(winner, bob);
        assertEq(winningBid, 120e6);
    }

    function test_reentrancySettleGuarded() public {
        MaliciousToken mal = new MaliciousToken();
        TacetRound r2 = new TacetRound(address(mal));
        mal.setTarget(r2);
        mal.mint(alice, 100);
        vm.prank(operator);
        uint256 rid = r2.createRound(keccak256("re"), revealRound, TacetRound.ClearingRule.HighestBid, commitDeadline, revealDeadline);
        bytes32 nonce = bytes32(uint256(99));
        vm.startPrank(alice);
        mal.approve(address(r2), 10);
        r2.commit(rid, r2.commitment(10, nonce), "c", "", 10);
        vm.stopPrank();
        vm.warp(commitDeadline + 1);
        r2.openReveal(rid);
        r2.reveal(rid, alice, 10, nonce);
        vm.warp(revealDeadline + 1);
        r2.clear(rid);
        r2.settle(rid);
        assertEq(mal.attackCount(), 1);
        (, , , , , , TacetRound.RoundStatus status, , ) = r2.getRound(rid);
        assertEq(uint8(status), uint8(TacetRound.RoundStatus.Settled));
    }

    function test_openRevealTwice() public {
        vm.warp(commitDeadline + 1);
        round.openReveal(roundId);
        vm.expectRevert(TacetRound.RevealAlreadyOpen.selector);
        round.openReveal(roundId);
    }
}
