// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {GpuHedgerTypes, IComputeOracle, IOptionFactory} from "./interfaces/IGpuHedger.sol";

/// @title ComputeOption
/// @notice A single, fully collateralized, cash-settled option series on a GPU compute price.
///
/// Economics (all amounts in settlement-token units, 6 decimals):
///  - Prices (strike, premium, spot, payout cap) are quoted per GPU-hour.
///  - One contract covers `contractSize` GPU-hours.
///  - Premium per contract   = premium * contractSize          (paid by buyer to writer)
///  - Collateral per contract = maxPayoutPerUnit * contractSize (posted by writer up front)
///  - Exercise payout         = min(intrinsic, maxPayoutPerUnit) * contractSize * contracts
///    where intrinsic = max(spot - strike, 0) for a CALL, max(strike - spot, 0) for a PUT.
///
/// Exercise is American-style: the holder may exercise any time before expiration while
/// the option is in the money. After expiration, unexercised positions expire worthless
/// and anyone may call {expire} to release the writer's remaining collateral.
/// Each series is deployed by {OptionFactory} as an EIP-1167 minimal proxy (clone) of a
/// single implementation, which keeps series creation cheap on Monad.
contract ComputeOption is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Series configuration (set once in {initialize})
    // ---------------------------------------------------------------------

    address public factory;
    address public writer;
    uint256 public seriesId;
    bytes32 public underlying;
    bytes32 public region;
    GpuHedgerTypes.OptionType public optionType;
    uint256 public strikePrice;
    uint256 public expiration;
    uint256 public contractSize;
    uint256 public premium;
    uint256 public maxPayoutPerUnit;
    IERC20 public settlementToken;
    IComputeOracle public oracle;
    uint256 public createdAt;

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    uint256 public maxContracts;
    uint256 public soldContracts;
    uint256 public openContracts;
    uint256 public exercisedContracts;
    uint256 public collateralBalance;
    uint256 public totalPaidOut;
    bool public settled;

    GpuHedgerTypes.Position[] private _positions;
    mapping(address => uint256[]) private _userPositionIds;

    // ---------------------------------------------------------------------
    // Events & errors
    // ---------------------------------------------------------------------

    event OptionPurchased(
        uint256 indexed positionId, address indexed buyer, uint256 contracts, uint256 premiumPaid
    );
    event OptionExercised(
        uint256 indexed positionId,
        address indexed holder,
        uint256 contracts,
        uint256 spotPrice,
        uint256 payout
    );
    event SeriesExpired(uint256 releasedCollateral, uint256 expiredContracts);
    event CapacityReduced(uint256 contracts, uint256 collateralReleased);
    event FreeCollateralWithdrawn(uint256 amount);

    error OnlyFactory();
    error OnlyWriter();
    error ProtocolPaused();
    error ZeroContracts();
    error InsufficientCapacity(uint256 available);
    error OptionExpired();
    error OptionNotExpired();
    error AlreadySettled();
    error NotPositionOwner();
    error PositionNotOpen();
    error OutOfTheMoney();
    error InvalidPosition();
    error NothingToWithdraw();
    error PremiumExceedsMax(uint256 cost, uint256 maxPremium);

    modifier whenNotPaused() {
        if (IOptionFactory(factory).paused()) revert ProtocolPaused();
        _;
    }

    modifier onlyWriter() {
        if (msg.sender != writer) revert OnlyWriter();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @dev Called once by {OptionFactory} right after cloning. The factory validates `p` and
    ///      transfers the collateral from `writer_` to this contract in the same transaction.
    function initialize(uint256 seriesId_, address writer_, GpuHedgerTypes.SeriesParams calldata p)
        external
        initializer
    {
        factory = msg.sender;
        writer = writer_;
        seriesId = seriesId_;
        underlying = p.underlying;
        region = p.region;
        optionType = p.optionType;
        strikePrice = p.strikePrice;
        expiration = p.expiration;
        contractSize = p.contractSize;
        premium = p.premium;
        maxPayoutPerUnit = p.maxPayoutPerUnit;
        settlementToken = IERC20(p.settlementToken);
        oracle = IComputeOracle(p.oracle);
        createdAt = block.timestamp;
        maxContracts = p.maxContracts;
        collateralBalance = p.maxPayoutPerUnit * p.contractSize * p.maxContracts;
    }

    // ---------------------------------------------------------------------
    // Buyer actions
    // ---------------------------------------------------------------------

    /// @notice Buy `contracts` option contracts. Premium is pulled from the caller and paid to the writer.
    /// @param maxPremium Slippage guard: the most the caller is willing to pay in total.
    function buyOption(uint256 contracts, uint256 maxPremium)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 positionId)
    {
        if (contracts == 0) revert ZeroContracts();
        if (block.timestamp >= expiration) revert OptionExpired();
        uint256 available = maxContracts - soldContracts;
        if (contracts > available) revert InsufficientCapacity(available);

        uint256 cost = quotePremium(contracts);
        if (cost > maxPremium) revert PremiumExceedsMax(cost, maxPremium);

        // Effects
        soldContracts += contracts;
        openContracts += contracts;
        positionId = _positions.length;
        _positions.push(
            GpuHedgerTypes.Position({
                id: positionId,
                owner: msg.sender,
                contracts: contracts,
                premiumPaid: cost,
                openedAt: block.timestamp,
                status: GpuHedgerTypes.PositionStatus.Open,
                payout: 0,
                closedAt: 0
            })
        );
        _userPositionIds[msg.sender].push(positionId);

        emit OptionPurchased(positionId, msg.sender, contracts, cost);

        // Interactions
        settlementToken.safeTransferFrom(msg.sender, writer, cost);
        IOptionFactory(factory)
            .recordActivity(GpuHedgerTypes.ActivityKind.Purchase, msg.sender, contracts, cost);
    }

    /// @notice Exercise an in-the-money position before expiration. Settles in the settlement token.
    function exercise(uint256 positionId) external nonReentrant whenNotPaused returns (uint256 payout) {
        if (positionId >= _positions.length) revert InvalidPosition();
        GpuHedgerTypes.Position storage pos = _positions[positionId];
        if (pos.owner != msg.sender) revert NotPositionOwner();
        if (pos.status != GpuHedgerTypes.PositionStatus.Open) revert PositionNotOpen();
        if (block.timestamp >= expiration) revert OptionExpired();

        uint256 spot = oracle.getPrice(underlying);
        payout = _payoutFor(spot, pos.contracts);
        if (payout == 0) revert OutOfTheMoney();

        // Effects
        pos.status = GpuHedgerTypes.PositionStatus.Exercised;
        pos.payout = payout;
        pos.closedAt = block.timestamp;
        openContracts -= pos.contracts;
        exercisedContracts += pos.contracts;
        collateralBalance -= payout;
        totalPaidOut += payout;

        emit OptionExercised(positionId, msg.sender, pos.contracts, spot, payout);

        // Interactions
        settlementToken.safeTransfer(msg.sender, payout);
        IOptionFactory(factory)
            .recordActivity(GpuHedgerTypes.ActivityKind.Exercise, msg.sender, pos.contracts, payout);
    }

    // ---------------------------------------------------------------------
    // Settlement & writer actions
    // ---------------------------------------------------------------------

    /// @notice After expiration, release all remaining collateral to the writer. Callable by anyone.
    function expire() external nonReentrant {
        if (block.timestamp < expiration) revert OptionNotExpired();
        if (settled) revert AlreadySettled();

        uint256 released = collateralBalance;
        uint256 expiredContracts = openContracts;

        settled = true;
        collateralBalance = 0;
        openContracts = 0;

        emit SeriesExpired(released, expiredContracts);

        if (released > 0) settlementToken.safeTransfer(writer, released);
        IOptionFactory(factory)
            .recordActivity(GpuHedgerTypes.ActivityKind.Expire, msg.sender, expiredContracts, released);
    }

    /// @notice Writer withdraws collateral backing unsold capacity. Locked collateral cannot be withdrawn.
    function reduceCapacity(uint256 contracts) external nonReentrant onlyWriter {
        if (contracts == 0) revert ZeroContracts();
        if (settled) revert AlreadySettled();
        uint256 available = maxContracts - soldContracts;
        if (contracts > available) revert InsufficientCapacity(available);

        uint256 amount = contracts * collateralPerContract();
        maxContracts -= contracts;
        collateralBalance -= amount;

        emit CapacityReduced(contracts, amount);
        settlementToken.safeTransfer(writer, amount);
    }

    /// @notice Writer withdraws collateral freed by exercises that paid out less than the cap.
    function withdrawFreeCollateral() external nonReentrant onlyWriter returns (uint256 amount) {
        amount = freeCollateral();
        if (amount == 0) revert NothingToWithdraw();
        collateralBalance -= amount;
        emit FreeCollateralWithdrawn(amount);
        settlementToken.safeTransfer(writer, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function collateralPerContract() public view returns (uint256) {
        return maxPayoutPerUnit * contractSize;
    }

    /// @notice Collateral locked behind open positions.
    function lockedCollateral() public view returns (uint256) {
        return openContracts * collateralPerContract();
    }

    /// @notice Collateral reserved for unsold capacity.
    function reservedCollateral() public view returns (uint256) {
        return (maxContracts - soldContracts) * collateralPerContract();
    }

    /// @notice Collateral the writer may withdraw without affecting any obligation.
    function freeCollateral() public view returns (uint256) {
        if (settled) return 0;
        uint256 committed = lockedCollateral() + reservedCollateral();
        return collateralBalance > committed ? collateralBalance - committed : 0;
    }

    function availableContracts() external view returns (uint256) {
        return maxContracts - soldContracts;
    }

    function quotePremium(uint256 contracts) public view returns (uint256) {
        return premium * contractSize * contracts;
    }

    function isExpired() public view returns (bool) {
        return block.timestamp >= expiration;
    }

    function isInTheMoney() external view returns (bool) {
        return _intrinsicPerUnit(oracle.getPrice(underlying)) > 0;
    }

    /// @notice Settlement value of `contracts` contracts at the current oracle price.
    function calculateExerciseValue(uint256 contracts) external view returns (uint256) {
        return _payoutFor(oracle.getPrice(underlying), contracts);
    }

    function getPosition(uint256 positionId) public view returns (GpuHedgerTypes.Position memory pos) {
        if (positionId >= _positions.length) revert InvalidPosition();
        pos = _positions[positionId];
        if (pos.status == GpuHedgerTypes.PositionStatus.Open && isExpired()) {
            pos.status = GpuHedgerTypes.PositionStatus.Expired;
        }
    }

    function positionCount() external view returns (uint256) {
        return _positions.length;
    }

    function getUserPositionIds(address user) external view returns (uint256[] memory) {
        return _userPositionIds[user];
    }

    function getUserPositions(address user) external view returns (GpuHedgerTypes.Position[] memory list) {
        uint256[] storage ids = _userPositionIds[user];
        list = new GpuHedgerTypes.Position[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = getPosition(ids[i]);
        }
    }

    function getOptionDetails() external view returns (GpuHedgerTypes.OptionDetails memory d) {
        d.seriesId = seriesId;
        d.option = address(this);
        d.underlying = underlying;
        d.region = region;
        d.optionType = optionType;
        d.strikePrice = strikePrice;
        d.expiration = expiration;
        d.contractSize = contractSize;
        d.premium = premium;
        d.maxPayoutPerUnit = maxPayoutPerUnit;
        d.maxContracts = maxContracts;
        d.soldContracts = soldContracts;
        d.openContracts = openContracts;
        d.exercisedContracts = exercisedContracts;
        d.collateralPerContract = collateralPerContract();
        d.collateralBalance = collateralBalance;
        d.lockedCollateral = lockedCollateral();
        d.totalPaidOut = totalPaidOut;
        d.settlementToken = address(settlementToken);
        d.oracle = address(oracle);
        d.writer = writer;
        d.factory = factory;
        d.createdAt = createdAt;
        d.settled = settled;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _intrinsicPerUnit(uint256 spot) internal view returns (uint256) {
        if (optionType == GpuHedgerTypes.OptionType.Call) {
            return spot > strikePrice ? spot - strikePrice : 0;
        }
        return strikePrice > spot ? strikePrice - spot : 0;
    }

    function _payoutFor(uint256 spot, uint256 contracts) internal view returns (uint256) {
        uint256 perUnit = _intrinsicPerUnit(spot);
        if (perUnit > maxPayoutPerUnit) perUnit = maxPayoutPerUnit;
        return perUnit * contractSize * contracts;
    }
}
