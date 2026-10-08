// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared types used across the GpuHedger protocol.
library GpuHedgerTypes {
    enum OptionType {
        Call,
        Put
    }

    enum PositionStatus {
        Open,
        Exercised,
        Expired
    }

    enum ActivityKind {
        SeriesCreated,
        Purchase,
        Exercise,
        Expire
    }

    /// @notice Parameters used to create a new option series.
    /// @dev All prices are denominated in the settlement token (6 decimals) per GPU-hour.
    struct SeriesParams {
        bytes32 underlying; // e.g. "H100"
        bytes32 region; // e.g. "US-East"
        OptionType optionType;
        uint256 strikePrice; // settlement-token units per GPU-hour
        uint256 expiration; // unix timestamp
        uint256 contractSize; // GPU-hours per contract
        uint256 premium; // settlement-token units per GPU-hour
        uint256 maxPayoutPerUnit; // payout cap per GPU-hour (fully collateralized)
        uint256 maxContracts; // capacity the writer collateralizes
        address oracle;
        address settlementToken;
    }

    struct OptionDetails {
        uint256 seriesId;
        address option;
        bytes32 underlying;
        bytes32 region;
        OptionType optionType;
        uint256 strikePrice;
        uint256 expiration;
        uint256 contractSize;
        uint256 premium;
        uint256 maxPayoutPerUnit;
        uint256 maxContracts;
        uint256 soldContracts;
        uint256 openContracts;
        uint256 exercisedContracts;
        uint256 collateralPerContract;
        uint256 collateralBalance;
        uint256 lockedCollateral;
        uint256 totalPaidOut;
        address settlementToken;
        address oracle;
        address writer;
        address factory;
        uint256 createdAt;
        bool settled;
    }

    struct Position {
        uint256 id;
        address owner;
        uint256 contracts;
        uint256 premiumPaid;
        uint256 openedAt;
        PositionStatus status;
        uint256 payout;
        uint256 closedAt;
    }

    struct UserPosition {
        uint256 seriesId;
        address option;
        Position position;
    }

    struct Activity {
        ActivityKind kind;
        uint256 seriesId;
        address account;
        uint256 contracts;
        uint256 amount;
        uint256 timestamp;
        uint256 blockNumber;
    }
}

/// @notice Minimal oracle interface. The MVP uses a permissioned oracle; a decentralized
///         oracle can later implement this same interface without changes to option contracts.
interface IComputeOracle {
    function getPrice(bytes32 asset) external view returns (uint256 price);
    function getPriceWithTimestamp(bytes32 asset) external view returns (uint256 price, uint256 updatedAt);
    function isSupported(bytes32 asset) external view returns (bool);
}

interface IOptionFactory {
    function paused() external view returns (bool);
    function recordActivity(
        GpuHedgerTypes.ActivityKind kind,
        address account,
        uint256 contracts,
        uint256 amount
    ) external;
}

interface IComputeOption {
    function getOptionDetails() external view returns (GpuHedgerTypes.OptionDetails memory);
    function getUserPositions(address user) external view returns (GpuHedgerTypes.Position[] memory);
}
