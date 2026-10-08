// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ComputeOption} from "./ComputeOption.sol";
import {GpuHedgerTypes, IComputeOracle, IComputeOption, IOptionFactory} from "./interfaces/IGpuHedger.sol";

/// @title OptionFactory
/// @notice Creates and indexes GPU compute option series. Each series is its own
///         {ComputeOption} contract holding the writer's collateral.
contract OptionFactory is IOptionFactory, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant WRITER_ROLE = keccak256("WRITER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MAX_CONTRACT_SIZE = 1_000_000; // GPU-hours per contract
    uint256 public constant MAX_DURATION = 730 days;
    uint256 public constant MAX_ACTIVITY_RETURNED = 100;

    /// @notice {ComputeOption} implementation that every series clones.
    address public immutable optionImplementation;

    address[] private _series;
    mapping(address => bool) public isSeries;
    mapping(address => bool) public approvedOracles;
    mapping(address => bool) public approvedTokens;

    GpuHedgerTypes.Activity[] private _activity;
    mapping(address => bool) private _isTrader;

    // Protocol-wide stats (settlement-token units where applicable)
    uint256 public totalTrades;
    uint256 public totalContractsTraded;
    uint256 public totalPremiumVolume;
    uint256 public totalExercises;
    uint256 public totalPayouts;
    uint256 public uniqueTraders;

    event SeriesCreated(
        uint256 indexed seriesId,
        address indexed option,
        address indexed writer,
        bytes32 underlying,
        GpuHedgerTypes.OptionType optionType,
        uint256 strikePrice,
        uint256 expiration,
        uint256 collateral
    );
    event OracleApproval(address indexed oracle, bool approved);
    event TokenApproval(address indexed token, bool approved);
    event ActivityRecorded(
        GpuHedgerTypes.ActivityKind indexed kind,
        uint256 indexed seriesId,
        address indexed account,
        uint256 amount
    );

    error ZeroAddress();
    error OracleNotApproved();
    error TokenNotApproved();
    error UnsupportedUnderlying();
    error InvalidStrike();
    error InvalidExpiration();
    error InvalidContractSize();
    error InvalidPremium();
    error InvalidPayoutCap();
    error InvalidCapacity();
    error InvalidSeriesId();
    error OnlySeries();

    constructor(address admin, address implementation, address oracle, address settlementToken) {
        if (
            admin == address(0) || implementation == address(0) || oracle == address(0)
                || settlementToken == address(0)
        ) revert ZeroAddress();
        optionImplementation = implementation;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(WRITER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        approvedOracles[oracle] = true;
        approvedTokens[settlementToken] = true;
        emit OracleApproval(oracle, true);
        emit TokenApproval(settlementToken, true);
    }

    // ---------------------------------------------------------------------
    // Series creation
    // ---------------------------------------------------------------------

    /// @notice Create a new fully collateralized option series. The caller is the writer and
    ///         must have approved this factory for `maxPayoutPerUnit * contractSize * maxContracts`.
    function createOptionSeries(GpuHedgerTypes.SeriesParams calldata p)
        external
        nonReentrant
        whenNotPaused
        onlyRole(WRITER_ROLE)
        returns (uint256 seriesId, address option)
    {
        _validate(p);

        seriesId = _series.length;
        uint256 collateral = p.maxPayoutPerUnit * p.contractSize * p.maxContracts;

        option = Clones.clone(optionImplementation);
        _series.push(option);
        isSeries[option] = true;
        ComputeOption(option).initialize(seriesId, msg.sender, p);

        _record(GpuHedgerTypes.ActivityKind.SeriesCreated, seriesId, msg.sender, p.maxContracts, collateral);
        emit SeriesCreated(
            seriesId, option, msg.sender, p.underlying, p.optionType, p.strikePrice, p.expiration, collateral
        );

        IERC20(p.settlementToken).safeTransferFrom(msg.sender, option, collateral);
    }

    function _validate(GpuHedgerTypes.SeriesParams calldata p) internal view {
        if (p.oracle == address(0) || p.settlementToken == address(0)) revert ZeroAddress();
        if (!approvedOracles[p.oracle]) revert OracleNotApproved();
        if (!approvedTokens[p.settlementToken]) revert TokenNotApproved();
        if (!IComputeOracle(p.oracle).isSupported(p.underlying)) revert UnsupportedUnderlying();
        if (p.strikePrice == 0) revert InvalidStrike();
        if (p.expiration <= block.timestamp || p.expiration > block.timestamp + MAX_DURATION) {
            revert InvalidExpiration();
        }
        if (p.contractSize == 0 || p.contractSize > MAX_CONTRACT_SIZE) revert InvalidContractSize();
        if (p.maxPayoutPerUnit == 0) revert InvalidPayoutCap();
        // A put can never pay more than its strike (spot >= 0).
        if (p.optionType == GpuHedgerTypes.OptionType.Put && p.maxPayoutPerUnit > p.strikePrice) {
            revert InvalidPayoutCap();
        }
        // Premium must be positive and below the maximum payout, otherwise the option is worthless to buy.
        if (p.premium == 0 || p.premium >= p.maxPayoutPerUnit) revert InvalidPremium();
        if (p.maxContracts == 0) revert InvalidCapacity();
    }

    // ---------------------------------------------------------------------
    // Activity tracking (called by series)
    // ---------------------------------------------------------------------

    function recordActivity(
        GpuHedgerTypes.ActivityKind kind,
        address account,
        uint256 contracts,
        uint256 amount
    ) external {
        if (!isSeries[msg.sender]) revert OnlySeries();
        _record(kind, ComputeOption(msg.sender).seriesId(), account, contracts, amount);
    }

    function _record(
        GpuHedgerTypes.ActivityKind kind,
        uint256 seriesId,
        address account,
        uint256 contracts,
        uint256 amount
    ) internal {
        if (kind == GpuHedgerTypes.ActivityKind.Purchase) {
            totalTrades += 1;
            totalContractsTraded += contracts;
            totalPremiumVolume += amount;
            if (!_isTrader[account]) {
                _isTrader[account] = true;
                uniqueTraders += 1;
            }
        } else if (kind == GpuHedgerTypes.ActivityKind.Exercise) {
            totalExercises += 1;
            totalPayouts += amount;
        }
        _activity.push(
            GpuHedgerTypes.Activity({
                kind: kind,
                seriesId: seriesId,
                account: account,
                contracts: contracts,
                amount: amount,
                timestamp: block.timestamp,
                blockNumber: block.number
            })
        );
        emit ActivityRecorded(kind, seriesId, account, amount);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setOracleApproval(address oracle, bool approved) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (oracle == address(0)) revert ZeroAddress();
        approvedOracles[oracle] = approved;
        emit OracleApproval(oracle, approved);
    }

    function setTokenApproval(address token, bool approved) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        approvedTokens[token] = approved;
        emit TokenApproval(token, approved);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function paused() public view override(IOptionFactory, Pausable) returns (bool) {
        return Pausable.paused();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function seriesCount() external view returns (uint256) {
        return _series.length;
    }

    function getSeries(uint256 seriesId) external view returns (address) {
        if (seriesId >= _series.length) revert InvalidSeriesId();
        return _series[seriesId];
    }

    function getAllSeries() external view returns (address[] memory) {
        return _series;
    }

    function getAllSeriesDetails() external view returns (GpuHedgerTypes.OptionDetails[] memory list) {
        list = new GpuHedgerTypes.OptionDetails[](_series.length);
        for (uint256 i = 0; i < _series.length; i++) {
            list[i] = IComputeOption(_series[i]).getOptionDetails();
        }
    }

    /// @notice Every position held by `user` across all series.
    function getUserPositions(address user)
        external
        view
        returns (GpuHedgerTypes.UserPosition[] memory list)
    {
        uint256 total;
        uint256 n = _series.length;
        GpuHedgerTypes.Position[][] memory perSeries = new GpuHedgerTypes.Position[][](n);
        for (uint256 i = 0; i < n; i++) {
            perSeries[i] = IComputeOption(_series[i]).getUserPositions(user);
            total += perSeries[i].length;
        }
        list = new GpuHedgerTypes.UserPosition[](total);
        uint256 k;
        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = 0; j < perSeries[i].length; j++) {
                list[k++] =
                    GpuHedgerTypes.UserPosition({seriesId: i, option: _series[i], position: perSeries[i][j]});
            }
        }
    }

    function activityCount() external view returns (uint256) {
        return _activity.length;
    }

    /// @notice Most recent activity, newest first.
    function getRecentActivity(uint256 limit) external view returns (GpuHedgerTypes.Activity[] memory list) {
        if (limit > MAX_ACTIVITY_RETURNED) limit = MAX_ACTIVITY_RETURNED;
        uint256 n = _activity.length < limit ? _activity.length : limit;
        list = new GpuHedgerTypes.Activity[](n);
        for (uint256 i = 0; i < n; i++) {
            list[i] = _activity[_activity.length - 1 - i];
        }
    }

    function getStats()
        external
        view
        returns (
            uint256 seriesCount_,
            uint256 trades,
            uint256 contractsTraded,
            uint256 premiumVolume,
            uint256 exercises,
            uint256 payouts,
            uint256 traders
        )
    {
        return (
            _series.length,
            totalTrades,
            totalContractsTraded,
            totalPremiumVolume,
            totalExercises,
            totalPayouts,
            uniqueTraders
        );
    }
}
