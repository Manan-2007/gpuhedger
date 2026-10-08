// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {GpuHedgerTypes, IComputeOracle, IOptionFactory, IPositionNFT} from "./interfaces/IGpuHedger.sol";

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
/// Lifecycle:
///  - Before expiry, holders may exercise any time while in the money (American-style).
///  - At expiry the series settles at the oracle price in effect at the expiration timestamp.
///    In-the-money positions are paid automatically on {claim}; nothing expires worthless
///    just because the holder was offline. The writer receives the remaining collateral.
///  - Each position is an ERC-721 token (PositionNFT); the current token holder owns it.
///
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
    uint256 public settlementPrice;
    uint256 public settlementPayoutPerContract;

    GpuHedgerTypes.Position[] private _positions;
    mapping(uint256 => uint256) public positionTokenId;

    // ---------------------------------------------------------------------
    // Events & errors
    // ---------------------------------------------------------------------

    event OptionPurchased(
        uint256 indexed positionId,
        address indexed buyer,
        uint256 tokenId,
        uint256 contracts,
        uint256 premiumPaid
    );
    event OptionExercised(
        uint256 indexed positionId,
        address indexed holder,
        uint256 contracts,
        uint256 spotPrice,
        uint256 payout
    );
    event OptionClaimed(
        uint256 indexed positionId, address indexed holder, uint256 contracts, uint256 payout
    );
    event SeriesSettled(uint256 settlementPrice, uint256 reservedForHolders, uint256 releasedToWriter);
    event CapacityReduced(uint256 contracts, uint256 collateralReleased);
    event FreeCollateralWithdrawn(uint256 amount);

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
    // Holder actions
    // ---------------------------------------------------------------------

    /// @notice Buy `contracts` option contracts. Premium is pulled from the caller and paid to the
    ///         writer; the caller receives a PositionNFT representing the position.
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

        // Interactions (factory and token are trusted protocol contracts)
        settlementToken.safeTransferFrom(msg.sender, writer, cost);
        uint256 tokenId = IOptionFactory(factory).mintPosition(msg.sender, positionId);
        positionTokenId[positionId] = tokenId;
        IOptionFactory(factory)
            .recordActivity(GpuHedgerTypes.ActivityKind.Purchase, msg.sender, contracts, cost);

        emit OptionPurchased(positionId, msg.sender, tokenId, contracts, cost);
    }

    /// @notice Exercise an in-the-money position before expiration. Settles in the settlement token.
    function exercise(uint256 positionId) external nonReentrant whenNotPaused returns (uint256 payout) {
        GpuHedgerTypes.Position storage pos = _ownedOpenPosition(positionId);
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

    /// @notice After expiry, claim the payout of a position that finished in the money.
    ///         Settles the series first if nobody has yet.
    function claim(uint256 positionId) external nonReentrant returns (uint256 payout) {
        if (block.timestamp < expiration) revert OptionNotExpired();
        if (!settled) _settle();
        GpuHedgerTypes.Position storage pos = _ownedOpenPosition(positionId);

        payout = settlementPayoutPerContract * pos.contracts;
        if (payout == 0) revert OutOfTheMoney();

        pos.status = GpuHedgerTypes.PositionStatus.Exercised;
        pos.payout = payout;
        pos.closedAt = block.timestamp;
        exercisedContracts += pos.contracts;
        collateralBalance -= payout;
        totalPaidOut += payout;

        emit OptionClaimed(positionId, msg.sender, pos.contracts, payout);

        settlementToken.safeTransfer(msg.sender, payout);
        IOptionFactory(factory)
            .recordActivity(GpuHedgerTypes.ActivityKind.Claim, msg.sender, pos.contracts, payout);
    }

    // ---------------------------------------------------------------------
    // Settlement & writer actions
    // ---------------------------------------------------------------------

    /// @notice After expiration, settle the series at the oracle price in effect at expiry.
    ///         Reserves what in-the-money holders are owed and releases the rest to the writer.
    ///         Callable by anyone.
    function expire() external nonReentrant {
        if (block.timestamp < expiration) revert OptionNotExpired();
        if (settled) revert AlreadySettled();
        _settle();
    }

    function _settle() internal {
        uint256 price = oracle.getPriceAt(underlying, expiration);
        uint256 perContract = _payoutFor(price, 1);
        uint256 owed = perContract * openContracts;
        uint256 released = collateralBalance - owed;
        uint256 expiredContracts = openContracts;

        settled = true;
        settlementPrice = price;
        settlementPayoutPerContract = perContract;
        collateralBalance = owed;
        openContracts = 0;

        emit SeriesSettled(price, owed, released);

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

    /// @notice Collateral locked behind open positions (before settlement).
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

    /// @notice Payout per contract at expiry: the settled value, or a preview from the oracle
    ///         price at expiration if the series hasn't been settled yet.
    function expiryPayoutPerContract() public view returns (uint256) {
        if (settled) return settlementPayoutPerContract;
        if (!isExpired()) return 0;
        try oracle.getPriceAt(underlying, expiration) returns (uint256 price) {
            return _payoutFor(price, 1);
        } catch {
            return 0;
        }
    }

    /// @notice Position with its current owner (the PositionNFT holder) and derived status.
    function getPosition(uint256 positionId) public view returns (GpuHedgerTypes.Position memory pos) {
        if (positionId >= _positions.length) revert InvalidPosition();
        pos = _positions[positionId];
        pos.owner = _holderOf(positionId);
        if (pos.status == GpuHedgerTypes.PositionStatus.Open && isExpired()) {
            pos.status = expiryPayoutPerContract() > 0
                ? GpuHedgerTypes.PositionStatus.Claimable
                : GpuHedgerTypes.PositionStatus.Expired;
        }
    }

    function positionCount() external view returns (uint256) {
        return _positions.length;
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

    function _holderOf(uint256 positionId) internal view returns (address) {
        return IPositionNFT(IOptionFactory(factory).positionNFT()).ownerOf(positionTokenId[positionId]);
    }

    function _ownedOpenPosition(uint256 positionId)
        internal
        view
        returns (GpuHedgerTypes.Position storage pos)
    {
        if (positionId >= _positions.length) revert InvalidPosition();
        pos = _positions[positionId];
        if (_holderOf(positionId) != msg.sender) revert NotPositionOwner();
        if (pos.status != GpuHedgerTypes.PositionStatus.Open) revert PositionNotOpen();
    }

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
