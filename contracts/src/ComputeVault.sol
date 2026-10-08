// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {GpuHedgerTypes} from "./interfaces/IGpuHedger.sol";
import {ComputeOption} from "./ComputeOption.sol";
import {OptionFactory} from "./OptionFactory.sol";

/// @title ComputeVault
/// @notice Liquidity providers deposit USDC and receive vault shares (ERC-4626). The vault acts as
///         an option writer: a manager uses pooled USDC to collateralize new option series, and
///         every premium buyers pay accrues to LPs. Collateral returns to the vault when series
///         settle.
///
/// NAV = idle USDC + Σ over live series (collateral held − current liability), where liability is
///       the in-the-money value of open contracts at the live oracle price. Withdrawals are
///       limited to idle USDC; collateral locked behind open options cannot leave.
contract ComputeVault is ERC4626, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    uint256 public constant MAX_ACTIVE_SERIES = 50;

    OptionFactory public immutable factory;

    address[] private _activeSeries;
    address[] private _allSeries;

    event SeriesWritten(address indexed option, uint256 indexed seriesId, uint256 collateral);
    event Harvested(address indexed option, uint256 returned, bool settled);

    error ZeroAddress();
    error WrongSettlementToken();
    error TooManyActiveSeries();
    error NotVaultSeries();

    constructor(IERC20 usdc, OptionFactory factory_, address admin)
        ERC20("GpuHedger LP Vault", "ghLP")
        ERC4626(usdc)
    {
        if (address(factory_) == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }
        factory = factory_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Manager: write options with pooled liquidity
    // ---------------------------------------------------------------------

    /// @notice Use vault USDC to collateralize a new option series. The vault becomes its writer.
    function writeSeries(GpuHedgerTypes.SeriesParams calldata p)
        external
        nonReentrant
        onlyRole(MANAGER_ROLE)
        returns (uint256 seriesId, address option)
    {
        if (p.settlementToken != asset()) revert WrongSettlementToken();
        if (_activeSeries.length >= MAX_ACTIVE_SERIES) revert TooManyActiveSeries();
        uint256 collateral = p.maxPayoutPerUnit * p.contractSize * p.maxContracts;
        IERC20(asset()).forceApprove(address(factory), collateral);
        (seriesId, option) = factory.createOptionSeries(p);
        _activeSeries.push(option);
        _allSeries.push(option);
        emit SeriesWritten(option, seriesId, collateral);
    }

    /// @notice Return unsold capacity of a vault series to idle liquidity.
    function reduceCapacity(address option, uint256 contracts) external nonReentrant onlyRole(MANAGER_ROLE) {
        _requireVaultSeries(option);
        ComputeOption(option).reduceCapacity(contracts);
    }

    /// @notice Pull collateral back from a series: settles it after expiry, or withdraws collateral
    ///         freed by exercises. Callable by anyone so LP liquidity never gets stuck.
    function harvest(address option) external nonReentrant returns (uint256 returned) {
        uint256 index = _requireVaultSeries(option);
        ComputeOption opt = ComputeOption(option);
        uint256 before = IERC20(asset()).balanceOf(address(this));
        if (!opt.settled() && opt.isExpired()) {
            opt.expire();
        } else if (opt.freeCollateral() > 0) {
            opt.withdrawFreeCollateral();
        }
        returned = IERC20(asset()).balanceOf(address(this)) - before;
        bool done = opt.settled();
        if (done) {
            _activeSeries[index] = _activeSeries[_activeSeries.length - 1];
            _activeSeries.pop();
        }
        emit Harvested(option, returned, done);
    }

    // ---------------------------------------------------------------------
    // ERC-4626 accounting
    // ---------------------------------------------------------------------

    function totalAssets() public view override returns (uint256 total) {
        total = idleAssets();
        for (uint256 i = 0; i < _activeSeries.length; i++) {
            total += seriesNetValue(_activeSeries[i]);
        }
    }

    function idleAssets() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Collateral held by a series minus what the vault owes its holders right now.
    function seriesNetValue(address option) public view returns (uint256) {
        ComputeOption opt = ComputeOption(option);
        if (opt.settled()) return 0; // remaining balance is reserved for holders
        uint256 held = opt.collateralBalance();
        uint256 open = opt.openContracts();
        uint256 liability;
        if (opt.isExpired()) {
            liability = opt.expiryPayoutPerContract() * open;
        } else {
            try opt.calculateExerciseValue(open) returns (uint256 v) {
                liability = v;
            } catch {
                liability = opt.lockedCollateral(); // oracle unavailable: assume worst case
            }
        }
        return held > liability ? held - liability : 0;
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        uint256 assets = super.maxWithdraw(owner);
        uint256 idle = idleAssets();
        return assets < idle ? assets : idle;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 shares = super.maxRedeem(owner);
        uint256 idleShares = convertToShares(idleAssets());
        return shares < idleShares ? shares : idleShares;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function activeSeries() external view returns (address[] memory) {
        return _activeSeries;
    }

    function allSeries() external view returns (address[] memory) {
        return _allSeries;
    }

    /// @notice Premiums received are plain USDC transfers to the vault; this view sums them across
    ///         every series the vault has written (for display).
    function premiumsEarned() external view returns (uint256 total) {
        for (uint256 i = 0; i < _allSeries.length; i++) {
            ComputeOption opt = ComputeOption(_allSeries[i]);
            total += opt.premium() * opt.contractSize() * opt.soldContracts();
        }
    }

    function _requireVaultSeries(address option) internal view returns (uint256) {
        for (uint256 i = 0; i < _activeSeries.length; i++) {
            if (_activeSeries[i] == option) return i;
        }
        revert NotVaultSeries();
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
