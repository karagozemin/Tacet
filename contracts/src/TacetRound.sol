// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TacetRound
/// @notice Sealed coordination round: commit sealed bids, reveal after Drand cue, settle on Arbitrum.
/// @dev Reveal gate is time-based after commit deadline; timelock ciphertext prevents early decryption.
///      On-chain BLS verification is not implemented in this MVP — see the root ARCHITECTURE.md.
contract TacetRound is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_CIPHERTEXT_BYTES = 4096;
    uint256 public constant MAX_AUDITOR_BLOB_BYTES = 2048;
    uint256 public constant VOID_GRACE_SECONDS = 3600;
    uint256 public constant VALUE_BYTES = 16;
    uint256 public constant NONCE_BYTES = 32;

    IERC20 public immutable token;

    enum RoundStatus {
        Open,
        Revealing,
        Cleared,
        Settled,
        Voided
    }

    enum ClearingRule {
        HighestBid,
        LowestBid
    }

    struct Round {
        address operator;
        bytes32 itemRef;
        uint64 revealRound;
        ClearingRule clearingRule;
        uint64 commitDeadline;
        uint64 revealDeadline;
        RoundStatus status;
        address winner;
        uint128 winningBid;
    }

    struct BidState {
        bytes32 commitment;
        uint128 escrow;
        uint128 revealedValue;
        bool revealed;
        bool valid;
        bool settled;
    }

    struct Seal {
        bytes ciphertext;
        bytes auditorBlob;
    }

    uint256 public nextRoundId = 1;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => address[]) internal _bidders;
    mapping(uint256 => mapping(address => BidState)) public bids;
    mapping(uint256 => mapping(address => Seal)) internal _seals;

    event RoundCreated(
        uint256 indexed roundId,
        address indexed operator,
        bytes32 itemRef,
        uint64 revealRound,
        uint64 commitDeadline,
        uint64 revealDeadline
    );
    event Committed(uint256 indexed roundId, address indexed bidder, bytes32 commitment, uint128 escrow);
    event RevealOpened(uint256 indexed roundId, uint64 revealRound);
    event Revealed(uint256 indexed roundId, address indexed bidder, uint128 value, bool valid);
    event Cleared(uint256 indexed roundId, address winner, uint128 winningBid);
    event Settled(uint256 indexed roundId, address winner, uint128 winningBid);
    event Voided(uint256 indexed roundId);
    event Refunded(uint256 indexed roundId, address indexed bidder, uint128 amount);

    error RoundNotFound();
    error WrongStatus(RoundStatus expected, RoundStatus actual);
    error CommitDeadlinePassed();
    error RevealNotOpen();
    error RevealWindowClosed();
    error RevealAlreadyOpen();
    error AlreadyRevealed();
    error HashMismatch();
    error InvalidBid();
    error NotCleared();
    error AlreadySettled();
    error AlreadyCleared();
    error NotVoidable();
    error RoundVoided();
    error ZeroEscrow();
    error CiphertextTooLarge();
    error AuditorBlobTooLarge();
    error InvalidDeadline();

    constructor(address token_) {
        require(token_ != address(0), "zero token");
        token = IERC20(token_);
    }

    function createRound(
        bytes32 itemRef,
        uint64 revealRound,
        ClearingRule clearingRule,
        uint64 commitDeadline,
        uint64 revealDeadline
    ) external returns (uint256 roundId) {
        if (commitDeadline >= revealDeadline) revert InvalidDeadline();
        if (block.timestamp >= commitDeadline) revert InvalidDeadline();

        roundId = nextRoundId++;
        rounds[roundId] = Round({
            operator: msg.sender,
            itemRef: itemRef,
            revealRound: revealRound,
            clearingRule: clearingRule,
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            status: RoundStatus.Open,
            winner: address(0),
            winningBid: 0
        });

        emit RoundCreated(roundId, msg.sender, itemRef, revealRound, commitDeadline, revealDeadline);
    }

    function commit(
        uint256 roundId,
        bytes32 commitmentHash,
        bytes calldata ciphertext,
        bytes calldata auditorBlob,
        uint128 escrow
    ) external nonReentrant {
        Round storage r = _requireRound(roundId);
        if (r.status != RoundStatus.Open) revert WrongStatus(RoundStatus.Open, r.status);
        if (block.timestamp > r.commitDeadline) revert CommitDeadlinePassed();
        if (escrow == 0) revert ZeroEscrow();
        if (ciphertext.length > MAX_CIPHERTEXT_BYTES) revert CiphertextTooLarge();
        if (auditorBlob.length > MAX_AUDITOR_BLOB_BYTES) revert AuditorBlobTooLarge();

        BidState storage b = bids[roundId][msg.sender];
        if (b.escrow > 0) {
            token.safeTransfer(msg.sender, b.escrow);
            emit Refunded(roundId, msg.sender, b.escrow);
        }

        token.safeTransferFrom(msg.sender, address(this), escrow);

        b.commitment = commitmentHash;
        b.escrow = escrow;
        b.revealedValue = 0;
        b.revealed = false;
        b.valid = false;
        b.settled = false;

        _seals[roundId][msg.sender] = Seal({ciphertext: ciphertext, auditorBlob: auditorBlob});

        if (!_isBidder(roundId, msg.sender)) {
            _bidders[roundId].push(msg.sender);
        }

        emit Committed(roundId, msg.sender, commitmentHash, escrow);
    }

    /// @notice Open reveal phase after commit deadline. Timelock ciphertext still requires Drand round R.
    function openReveal(uint256 roundId) external {
        Round storage r = _requireRound(roundId);
        if (r.status != RoundStatus.Open) {
            if (r.status == RoundStatus.Revealing) revert RevealAlreadyOpen();
            revert WrongStatus(RoundStatus.Open, r.status);
        }
        if (block.timestamp <= r.commitDeadline) revert RevealNotOpen();

        r.status = RoundStatus.Revealing;
        emit RevealOpened(roundId, r.revealRound);
    }

    function reveal(uint256 roundId, address bidder, uint128 value, bytes32 nonce) external {
        Round storage r = _requireRound(roundId);
        if (r.status != RoundStatus.Revealing) revert WrongStatus(RoundStatus.Revealing, r.status);
        if (block.timestamp > r.revealDeadline) revert RevealWindowClosed();

        BidState storage b = bids[roundId][bidder];
        if (b.escrow == 0) revert InvalidBid();
        if (b.revealed) revert AlreadyRevealed();

        bytes32 computed = _commitment(value, nonce);
        if (computed != b.commitment) revert HashMismatch();

        bool valid = value > 0 && value <= b.escrow;
        b.revealed = true;
        b.revealedValue = value;
        b.valid = valid;

        emit Revealed(roundId, bidder, value, valid);
    }

    function clear(uint256 roundId) external nonReentrant returns (address winner, uint128 winningBid) {
        Round storage r = _requireRound(roundId);
        if (r.status == RoundStatus.Cleared || r.status == RoundStatus.Settled) revert AlreadyCleared();
        if (r.status == RoundStatus.Voided) revert RoundVoided();
        if (r.status != RoundStatus.Revealing) revert WrongStatus(RoundStatus.Revealing, r.status);
        if (block.timestamp <= r.revealDeadline) revert RevealWindowClosed();

        address[] memory bidders = _bidders[roundId];
        address bestBidder = address(0);
        uint128 bestValue = 0;
        bool found = false;

        for (uint256 i = 0; i < bidders.length; i++) {
            BidState storage b = bids[roundId][bidders[i]];
            if (!b.revealed || !b.valid) continue;

            if (!found) {
                bestBidder = bidders[i];
                bestValue = b.revealedValue;
                found = true;
            } else if (r.clearingRule == ClearingRule.HighestBid) {
                if (b.revealedValue > bestValue || (b.revealedValue == bestValue && bidders[i] < bestBidder)) {
                    bestBidder = bidders[i];
                    bestValue = b.revealedValue;
                }
            } else {
                if (b.revealedValue < bestValue || (b.revealedValue == bestValue && bidders[i] < bestBidder)) {
                    bestBidder = bidders[i];
                    bestValue = b.revealedValue;
                }
            }
        }

        if (!found) {
            r.status = RoundStatus.Voided;
            for (uint256 i = 0; i < bidders.length; i++) {
                _refundBid(roundId, bidders[i]);
            }
            emit Voided(roundId);
            return (address(0), 0);
        }

        r.status = RoundStatus.Cleared;
        r.winner = bestBidder;
        r.winningBid = bestValue;
        emit Cleared(roundId, bestBidder, bestValue);
        return (bestBidder, bestValue);
    }

    function settle(uint256 roundId) external nonReentrant {
        Round storage r = _requireRound(roundId);
        if (r.status == RoundStatus.Settled) revert AlreadySettled();
        if (r.status != RoundStatus.Cleared) revert NotCleared();

        address[] memory bidders = _bidders[roundId];
        address winner = r.winner;
        uint128 winningBid = r.winningBid;

        for (uint256 i = 0; i < bidders.length; i++) {
            BidState storage b = bids[roundId][bidders[i]];
            if (b.settled || b.escrow == 0) continue;

            if (bidders[i] == winner) {
                uint128 surplus = b.escrow - winningBid;
                token.safeTransfer(r.operator, winningBid);
                if (surplus > 0) {
                    token.safeTransfer(winner, surplus);
                    emit Refunded(roundId, winner, surplus);
                }
            } else {
                token.safeTransfer(bidders[i], b.escrow);
                emit Refunded(roundId, bidders[i], b.escrow);
            }
            b.settled = true;
        }

        r.status = RoundStatus.Settled;
        emit Settled(roundId, winner, winningBid);
    }

    function voidRound(uint256 roundId) external nonReentrant {
        Round storage r = _requireRound(roundId);
        if (r.status != RoundStatus.Open) revert NotVoidable();
        if (block.timestamp <= uint256(r.revealDeadline) + VOID_GRACE_SECONDS) revert NotVoidable();

        address[] memory bidders = _bidders[roundId];
        for (uint256 i = 0; i < bidders.length; i++) {
            _refundBid(roundId, bidders[i]);
        }

        r.status = RoundStatus.Voided;
        emit Voided(roundId);
    }

    function getRound(uint256 roundId)
        external
        view
        returns (
            address operator,
            bytes32 itemRef,
            uint64 revealRound,
            ClearingRule clearingRule,
            uint64 commitDeadline,
            uint64 revealDeadline,
            RoundStatus status,
            address winner,
            uint128 winningBid
        )
    {
        Round storage r = _requireRound(roundId);
        return (
            r.operator,
            r.itemRef,
            r.revealRound,
            r.clearingRule,
            r.commitDeadline,
            r.revealDeadline,
            r.status,
            r.winner,
            r.winningBid
        );
    }

    function getBidders(uint256 roundId) external view returns (address[] memory) {
        _requireRound(roundId);
        return _bidders[roundId];
    }

    function getBidState(uint256 roundId, address bidder)
        external
        view
        returns (bytes32 commitmentHash, uint128 escrow, uint128 revealedValue, bool revealed, bool valid, bool settled)
    {
        _requireRound(roundId);
        BidState storage b = bids[roundId][bidder];
        return (b.commitment, b.escrow, b.revealedValue, b.revealed, b.valid, b.settled);
    }

    function getSeal(uint256 roundId, address bidder) external view returns (bytes memory ciphertext, bytes memory auditorBlob) {
        _requireRound(roundId);
        Seal storage s = _seals[roundId][bidder];
        return (s.ciphertext, s.auditorBlob);
    }

    function commitment(uint128 value, bytes32 nonce) external pure returns (bytes32) {
        return _commitment(value, nonce);
    }

    /// @dev H = sha256(be16(value) ‖ nonce32) — matches @tacet/tlock off-chain encoding.
    function _commitment(uint128 value, bytes32 nonce) internal pure returns (bytes32) {
        return sha256(abi.encodePacked(value, nonce));
    }

    function _refundBid(uint256 roundId, address bidder) internal {
        BidState storage b = bids[roundId][bidder];
        if (b.escrow == 0 || b.settled) return;
        uint128 amount = b.escrow;
        b.settled = true;
        token.safeTransfer(bidder, amount);
        emit Refunded(roundId, bidder, amount);
    }

    function _isBidder(uint256 roundId, address bidder) internal view returns (bool) {
        address[] storage list = _bidders[roundId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == bidder) return true;
        }
        return false;
    }

    function _requireRound(uint256 roundId) internal view returns (Round storage r) {
        if (roundId == 0 || roundId >= nextRoundId) revert RoundNotFound();
        return rounds[roundId];
    }
}
