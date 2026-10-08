// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IComputeOracle} from "./interfaces/IGpuHedger.sol";

/// @title ComputeOracle
/// @notice Reference prices for standardized GPU compute (USD per GPU-hour, 6 decimals).
/// @dev Intentionally a controlled (permissioned) oracle for the hackathon MVP. Option
///      contracts only depend on {IComputeOracle}, so this can be swapped for a
///      decentralized feed later.
contract ComputeOracle is IComputeOracle, AccessControl {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    uint8 public constant DECIMALS = 6;
    uint256 public constant MAX_PRICE = 10_000e6; // $10,000 per GPU-hour sanity bound
    uint256 public constant MAX_VOLATILITY_BPS = 50_000; // 500%
    uint256 public constant MAX_HISTORY_RETURNED = 100;

    struct PriceData {
        uint256 price;
        uint256 updatedAt;
        uint256 volatilityBps; // annualized implied volatility, basis points
        bool supported;
    }

    struct PricePoint {
        uint256 price;
        uint256 timestamp;
    }

    mapping(bytes32 => PriceData) private _prices;
    mapping(bytes32 => PricePoint[]) private _history;
    bytes32[] private _assets;

    event AssetAdded(bytes32 indexed asset, uint256 price, uint256 volatilityBps);
    event PriceUpdated(
        bytes32 indexed asset, uint256 oldPrice, uint256 newPrice, uint256 timestamp, address updater
    );
    event VolatilityUpdated(bytes32 indexed asset, uint256 volatilityBps, address updater);

    error UnsupportedAsset(bytes32 asset);
    error AssetAlreadyExists(bytes32 asset);
    error InvalidPrice();
    error InvalidVolatility();
    error InvalidAsset();
    error LengthMismatch();
    error PriceUnavailable(bytes32 asset);
    error ZeroAddress();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function addAsset(bytes32 asset, uint256 price, uint256 volatilityBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (asset == bytes32(0)) revert InvalidAsset();
        if (_prices[asset].supported) revert AssetAlreadyExists(asset);
        _validatePrice(price);
        _validateVolatility(volatilityBps);
        _prices[asset] = PriceData({
            price: price, updatedAt: block.timestamp, volatilityBps: volatilityBps, supported: true
        });
        _assets.push(asset);
        _history[asset].push(PricePoint(price, block.timestamp));
        emit AssetAdded(asset, price, volatilityBps);
        emit PriceUpdated(asset, 0, price, block.timestamp, msg.sender);
    }

    function setPrice(bytes32 asset, uint256 price) public onlyRole(ORACLE_ROLE) {
        PriceData storage data = _prices[asset];
        if (!data.supported) revert UnsupportedAsset(asset);
        _validatePrice(price);
        uint256 oldPrice = data.price;
        data.price = price;
        data.updatedAt = block.timestamp;
        _history[asset].push(PricePoint(price, block.timestamp));
        emit PriceUpdated(asset, oldPrice, price, block.timestamp, msg.sender);
    }

    function setPrices(bytes32[] calldata assets, uint256[] calldata prices) external onlyRole(ORACLE_ROLE) {
        if (assets.length != prices.length) revert LengthMismatch();
        for (uint256 i = 0; i < assets.length; i++) {
            setPrice(assets[i], prices[i]);
        }
    }

    function setVolatility(bytes32 asset, uint256 volatilityBps) external onlyRole(ORACLE_ROLE) {
        PriceData storage data = _prices[asset];
        if (!data.supported) revert UnsupportedAsset(asset);
        _validateVolatility(volatilityBps);
        data.volatilityBps = volatilityBps;
        emit VolatilityUpdated(asset, volatilityBps, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getPrice(bytes32 asset) external view returns (uint256) {
        PriceData storage data = _prices[asset];
        if (!data.supported || data.price == 0) revert PriceUnavailable(asset);
        return data.price;
    }

    function getPriceWithTimestamp(bytes32 asset) external view returns (uint256 price, uint256 updatedAt) {
        PriceData storage data = _prices[asset];
        if (!data.supported || data.price == 0) revert PriceUnavailable(asset);
        return (data.price, data.updatedAt);
    }

    function getVolatility(bytes32 asset) external view returns (uint256) {
        PriceData storage data = _prices[asset];
        if (!data.supported) revert UnsupportedAsset(asset);
        return data.volatilityBps;
    }

    /// @notice Price in effect at `timestamp`: the most recent update at or before it (binary search).
    function getPriceAt(bytes32 asset, uint256 timestamp) external view returns (uint256) {
        PricePoint[] storage hist = _history[asset];
        uint256 n = hist.length;
        if (n == 0 || hist[0].timestamp > timestamp) revert PriceUnavailable(asset);
        uint256 lo = 0;
        uint256 hi = n - 1;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (hist[mid].timestamp <= timestamp) lo = mid;
            else hi = mid - 1;
        }
        return hist[lo].price;
    }

    function isSupported(bytes32 asset) external view returns (bool) {
        return _prices[asset].supported;
    }

    function getAssets() external view returns (bytes32[] memory) {
        return _assets;
    }

    /// @notice Snapshot of every supported asset, for frontends.
    function getAllPrices()
        external
        view
        returns (
            bytes32[] memory assets,
            uint256[] memory prices,
            uint256[] memory updatedAt,
            uint256[] memory vols
        )
    {
        uint256 n = _assets.length;
        assets = _assets;
        prices = new uint256[](n);
        updatedAt = new uint256[](n);
        vols = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            PriceData storage data = _prices[_assets[i]];
            prices[i] = data.price;
            updatedAt[i] = data.updatedAt;
            vols[i] = data.volatilityBps;
        }
    }

    /// @notice Most recent oracle updates for an asset (oldest first), capped at MAX_HISTORY_RETURNED.
    function getPriceHistory(bytes32 asset) external view returns (PricePoint[] memory points) {
        PricePoint[] storage all = _history[asset];
        uint256 n = all.length > MAX_HISTORY_RETURNED ? MAX_HISTORY_RETURNED : all.length;
        points = new PricePoint[](n);
        uint256 start = all.length - n;
        for (uint256 i = 0; i < n; i++) {
            points[i] = all[start + i];
        }
    }

    function _validatePrice(uint256 price) private pure {
        if (price == 0 || price > MAX_PRICE) revert InvalidPrice();
    }

    function _validateVolatility(uint256 volatilityBps) private pure {
        if (volatilityBps == 0 || volatilityBps > MAX_VOLATILITY_BPS) revert InvalidVolatility();
    }
}
