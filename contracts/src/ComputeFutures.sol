// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IComputeOracle} from "./interfaces/IGpuHedger.sol";

/// @title ComputeFutures
/// @notice Fixed-price GPU compute forwards. A LONG locks in a compute cost (an AI startup);
///         a SHORT locks in rental revenue (a GPU provider). A market maker (writer) takes the
///         other side of every position.
///
/// Each market has a forward price F and a band B (max price move per GPU-hour that settles).
/// Both sides post B × contractSize per contract, so every position is fully funded. At expiry
/// the market settles at the oracle price S in effect at the expiration timestamp:
///   long P&L per GPU-hour  = clamp(S − F, −B, +B)
///   short P&L per GPU-hour = −clamp(S − F, −B, +B)
/// There is no premium. Positions settle by calling {settlePosition}; anyone may trigger it.
contract ComputeFutures is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant WRITER_ROLE = keccak256("WRITER_ROLE");
    uint256 public constant MAX_CONTRACT_SIZE = 1_000_000;
    uint256 public constant MAX_DURATION = 730 days;

    enum Side {
        Long,
        Short
    }

    struct Market {
        uint256 id;
        bytes32 underlying;
        bytes32 region;
        uint256 forwardPrice; // USDC (6dp) per GPU-hour
        uint256 band; // max settled move per GPU-hour
        uint256 expiration;
        uint256 contractSize;
        uint256 maxContracts;
        uint256 usedContracts; // capacity consumed by open positions
        uint256 longContracts;
        uint256 shortContracts;
        uint256 writerCollateral; // writer funds held for this market
        address writer;
        bool settled;
        uint256 settlementPrice;
    }

    struct Position {
        uint256 id;
        uint256 marketId;
        address owner;
        Side side;
        uint256 contracts;
        uint256 margin;
        uint256 openedAt;
        bool closed;
        uint256 payout;
    }

    IERC20 public immutable usdc;
    IComputeOracle public immutable oracle;

    Market[] private _markets;
    Position[] private _positions;
    mapping(address => uint256[]) private _userPositions;

    uint256 public totalPositions;
    uint256 public totalNotional; // forward price × GPU-hours, USDC

    event MarketCreated(
        uint256 indexed marketId, bytes32 underlying, uint256 forwardPrice, uint256 band, uint256 expiration
    );
    event PositionOpened(
        uint256 indexed positionId,
        uint256 indexed marketId,
        address indexed owner,
        Side side,
        uint256 contracts,
        uint256 margin
    );
    event MarketSettled(uint256 indexed marketId, uint256 settlementPrice);
    event PositionSettled(
        uint256 indexed positionId, address indexed owner, uint256 payout, uint256 writerReturn
    );
    event CapacityReduced(uint256 indexed marketId, uint256 contracts, uint256 released);

    error ZeroAddress();
    error UnsupportedUnderlying();
    error InvalidParams();
    error InvalidMarket();
    error InvalidPosition();
    error ZeroContracts();
    error InsufficientCapacity(uint256 available);
    error MarketExpired();
    error MarketNotExpired();
    error AlreadyClosed();
    error OnlyWriter();

    constructor(address admin, IERC20 usdc_, IComputeOracle oracle_) {
        if (admin == address(0) || address(usdc_) == address(0) || address(oracle_) == address(0)) {
            revert ZeroAddress();
        }
        usdc = usdc_;
        oracle = oracle_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(WRITER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Writer
    // ---------------------------------------------------------------------

    /// @notice Create a futures market and post the writer's collateral (band × size × maxContracts).
    function createMarket(
        bytes32 underlying,
        bytes32 region,
        uint256 forwardPrice,
        uint256 band,
        uint256 expiration,
        uint256 contractSize,
        uint256 maxContracts
    ) external nonReentrant whenNotPaused onlyRole(WRITER_ROLE) returns (uint256 marketId) {
        if (!oracle.isSupported(underlying)) revert UnsupportedUnderlying();
        if (
            forwardPrice == 0 || band == 0 || band > forwardPrice || contractSize == 0
                || contractSize > MAX_CONTRACT_SIZE || maxContracts == 0 || expiration <= block.timestamp
                || expiration > block.timestamp + MAX_DURATION
        ) revert InvalidParams();

        uint256 collateral = band * contractSize * maxContracts;
        marketId = _markets.length;
        _markets.push(
            Market({
                id: marketId,
                underlying: underlying,
                region: region,
                forwardPrice: forwardPrice,
                band: band,
                expiration: expiration,
                contractSize: contractSize,
                maxContracts: maxContracts,
                usedContracts: 0,
                longContracts: 0,
                shortContracts: 0,
                writerCollateral: collateral,
                writer: msg.sender,
                settled: false,
                settlementPrice: 0
            })
        );
        emit MarketCreated(marketId, underlying, forwardPrice, band, expiration);
        usdc.safeTransferFrom(msg.sender, address(this), collateral);
    }

    /// @notice Writer withdraws collateral for capacity no position is using.
    function reduceCapacity(uint256 marketId, uint256 contracts) external nonReentrant {
        Market storage m = _market(marketId);
        if (msg.sender != m.writer) revert OnlyWriter();
        if (contracts == 0) revert ZeroContracts();
        uint256 available = m.maxContracts - m.usedContracts;
        if (contracts > available) revert InsufficientCapacity(available);
        uint256 amount = m.band * m.contractSize * contracts;
        m.maxContracts -= contracts;
        m.writerCollateral -= amount;
        emit CapacityReduced(marketId, contracts, amount);
        usdc.safeTransfer(m.writer, amount);
    }

    // ---------------------------------------------------------------------
    // Traders
    // ---------------------------------------------------------------------

    /// @notice Open a LONG (lock in compute cost) or SHORT (lock in rental revenue) position.
    ///         Posts margin = band × contractSize × contracts.
    function openPosition(uint256 marketId, Side side, uint256 contracts)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 positionId)
    {
        Market storage m = _market(marketId);
        if (contracts == 0) revert ZeroContracts();
        if (block.timestamp >= m.expiration) revert MarketExpired();
        uint256 available = m.maxContracts - m.usedContracts;
        if (contracts > available) revert InsufficientCapacity(available);

        uint256 margin = m.band * m.contractSize * contracts;
        m.usedContracts += contracts;
        if (side == Side.Long) m.longContracts += contracts;
        else m.shortContracts += contracts;

        positionId = _positions.length;
        _positions.push(
            Position({
                id: positionId,
                marketId: marketId,
                owner: msg.sender,
                side: side,
                contracts: contracts,
                margin: margin,
                openedAt: block.timestamp,
                closed: false,
                payout: 0
            })
        );
        _userPositions[msg.sender].push(positionId);
        totalPositions += 1;
        totalNotional += m.forwardPrice * m.contractSize * contracts;

        emit PositionOpened(positionId, marketId, msg.sender, side, contracts, margin);
        usdc.safeTransferFrom(msg.sender, address(this), margin);
    }

    /// @notice Record the settlement price (oracle price in effect at expiry). Callable by anyone.
    function settleMarket(uint256 marketId) public {
        Market storage m = _market(marketId);
        if (block.timestamp < m.expiration) revert MarketNotExpired();
        if (m.settled) return;
        m.settled = true;
        m.settlementPrice = oracle.getPriceAt(m.underlying, m.expiration);
        emit MarketSettled(marketId, m.settlementPrice);
    }

    /// @notice Settle a position after expiry: pays the holder and returns the writer's share.
    ///         Callable by anyone; funds always go to the position owner and the writer.
    function settlePosition(uint256 positionId) external nonReentrant returns (uint256 payout) {
        if (positionId >= _positions.length) revert InvalidPosition();
        Position storage p = _positions[positionId];
        if (p.closed) revert AlreadyClosed();
        Market storage m = _markets[p.marketId];
        if (!m.settled) settleMarket(p.marketId);

        int256 pnl = positionPnl(positionId);
        uint256 writerCommit = p.margin; // writer posted the same amount per contract
        payout = uint256(int256(p.margin) + pnl);
        uint256 writerReturn = p.margin + writerCommit - payout;

        p.closed = true;
        p.payout = payout;
        m.usedContracts -= p.contracts;
        m.maxContracts -= p.contracts; // capacity is consumed once settled
        m.writerCollateral -= writerCommit;

        emit PositionSettled(positionId, p.owner, payout, writerReturn);
        if (payout > 0) usdc.safeTransfer(p.owner, payout);
        if (writerReturn > 0) usdc.safeTransfer(m.writer, writerReturn);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Holder P&L in USDC at the settlement price (if settled) or the live oracle price.
    function positionPnl(uint256 positionId) public view returns (int256) {
        if (positionId >= _positions.length) revert InvalidPosition();
        Position storage p = _positions[positionId];
        Market storage m = _markets[p.marketId];
        uint256 price = m.settled ? m.settlementPrice : oracle.getPrice(m.underlying);
        int256 diff = int256(price) - int256(m.forwardPrice);
        int256 band = int256(m.band);
        if (diff > band) diff = band;
        if (diff < -band) diff = -band;
        int256 perPosition = diff * int256(m.contractSize * p.contracts);
        return p.side == Side.Long ? perPosition : -perPosition;
    }

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _market(marketId);
    }

    function getMarkets() external view returns (Market[] memory) {
        return _markets;
    }

    function getPosition(uint256 positionId) external view returns (Position memory) {
        if (positionId >= _positions.length) revert InvalidPosition();
        return _positions[positionId];
    }

    function getUserPositions(address user) external view returns (Position[] memory list) {
        uint256[] storage ids = _userPositions[user];
        list = new Position[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = _positions[ids[i]];
        }
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _market(uint256 marketId) internal view returns (Market storage) {
        if (marketId >= _markets.length) revert InvalidMarket();
        return _markets[marketId];
    }
}
