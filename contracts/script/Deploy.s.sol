// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ComputeOracle} from "../src/ComputeOracle.sol";
import {ComputeOption} from "../src/ComputeOption.sol";
import {OptionFactory} from "../src/OptionFactory.sol";
import {PositionNFT} from "../src/PositionNFT.sol";
import {ComputeVault} from "../src/ComputeVault.sol";
import {ComputeFutures} from "../src/ComputeFutures.sol";
import {GpuHedgerTypes} from "../src/interfaces/IGpuHedger.sol";

/// @notice Deploys the full GpuHedger stack and seeds demo markets.
///
/// Usage (Monad Testnet, using an encrypted keystore account):
///   forge script script/Deploy.s.sol --rpc-url monad_testnet --account <name> --broadcast
///
/// Writes addresses to deployments/<chainId>.json and to the frontend.
contract Deploy is Script {
    uint256 constant USDC = 1e6;

    bytes32 constant H100 = "H100";
    bytes32 constant A100 = "A100";
    bytes32 constant B200 = "B200";

    MockUSDC usdc;
    ComputeOracle oracle;
    OptionFactory factory;
    PositionNFT nft;
    ComputeVault vault;
    ComputeFutures futures;

    function run() external {
        vm.startBroadcast();
        address deployer = msg.sender;

        // 1. Settlement token (TESTNET ONLY)
        usdc = new MockUSDC(10_000 * USDC);

        // 2. Oracle with initial prices ($ per GPU-hour, 6 decimals) and implied vols (bps)
        oracle = new ComputeOracle(deployer);
        oracle.addAsset(H100, 2_000_000, 4_200); // $2.00, 42%
        oracle.addAsset(A100, 1_300_000, 3_500); // $1.30, 35%
        oracle.addAsset(B200, 3_800_000, 5_500); // $3.80, 55%

        // 3. Position NFT + option implementation + factory (deployer gets admin, writer and pauser roles)
        nft = new PositionNFT(deployer);
        factory = new OptionFactory(
            deployer, address(new ComputeOption()), address(nft), address(oracle), address(usdc)
        );
        nft.grantRole(nft.MINTER_ROLE(), address(factory));

        // 4. LP vault (writes options with pooled liquidity) and futures market
        vault = new ComputeVault(usdc, factory, deployer);
        factory.grantRole(factory.WRITER_ROLE(), address(vault));
        futures = new ComputeFutures(deployer, usdc, oracle);

        // 5. Writer collateral for the seeded markets
        usdc.mint(deployer, 5_000_000 * USDC);
        usdc.approve(address(factory), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        usdc.approve(address(futures), type(uint256).max);

        // 6. Seed option series. Premiums ~= Black-Scholes model price + spread.
        //    Calls are capped at 2x strike (payout cap = strike); puts are capped at strike.
        _create(H100, "US-East", GpuHedgerTypes.OptionType.Call, 2_200_000, 30, 35_000, 2_200_000, 500);
        _create(H100, "US-East", GpuHedgerTypes.OptionType.Call, 2_500_000, 30, 4_000, 2_500_000, 500);
        _create(H100, "US-East", GpuHedgerTypes.OptionType.Put, 1_800_000, 30, 25_000, 1_800_000, 500);
        _create(H100, "US-West", GpuHedgerTypes.OptionType.Call, 2_000_000, 14, 73_000, 2_000_000, 500);
        _create(H100, "EU-West", GpuHedgerTypes.OptionType.Put, 2_000_000, 60, 140_000, 2_000_000, 500);
        _create(A100, "US-East", GpuHedgerTypes.OptionType.Call, 1_500_000, 30, 6_000, 1_500_000, 500);
        _create(A100, "EU-West", GpuHedgerTypes.OptionType.Put, 1_200_000, 30, 16_000, 1_200_000, 500);
        _create(B200, "US-East", GpuHedgerTypes.OptionType.Call, 4_200_000, 60, 215_000, 4_200_000, 300);
        _create(B200, "US-West", GpuHedgerTypes.OptionType.Put, 3_500_000, 30, 115_000, 3_500_000, 300);

        // 7. Seed the LP vault and let it write two series with pooled liquidity
        vault.deposit(250_000 * USDC, deployer);
        vault.writeSeries(
            _params(H100, "US-East", GpuHedgerTypes.OptionType.Call, 2_400_000, 45, 19_000, 2_400_000, 300)
        );
        vault.writeSeries(
            _params(A100, "US-East", GpuHedgerTypes.OptionType.Put, 1_250_000, 45, 40_000, 1_250_000, 300)
        );

        // 8. Futures markets: forward ≈ spot, ±band per GPU-hour
        futures.createMarket(H100, "US-East", 2_050_000, 1_000_000, block.timestamp + 30 days, 100, 500);
        futures.createMarket(A100, "US-East", 1_320_000, 600_000, block.timestamp + 30 days, 100, 500);
        futures.createMarket(B200, "US-East", 3_950_000, 1_500_000, block.timestamp + 60 days, 100, 300);

        vm.stopBroadcast();

        _writeDeployment(deployer);

        console2.log("MockUSDC      ", address(usdc));
        console2.log("ComputeOracle ", address(oracle));
        console2.log("OptionFactory ", address(factory));
        console2.log("PositionNFT   ", address(nft));
        console2.log("ComputeVault  ", address(vault));
        console2.log("ComputeFutures", address(futures));
        console2.log("Series created", factory.seriesCount());
    }

    function _create(
        bytes32 underlying,
        bytes32 region,
        GpuHedgerTypes.OptionType optionType,
        uint256 strike,
        uint256 daysToExpiry,
        uint256 premium,
        uint256 cap,
        uint256 maxContracts
    ) internal {
        factory.createOptionSeries(
            _params(underlying, region, optionType, strike, daysToExpiry, premium, cap, maxContracts)
        );
    }

    function _params(
        bytes32 underlying,
        bytes32 region,
        GpuHedgerTypes.OptionType optionType,
        uint256 strike,
        uint256 daysToExpiry,
        uint256 premium,
        uint256 cap,
        uint256 maxContracts
    ) internal view returns (GpuHedgerTypes.SeriesParams memory) {
        return GpuHedgerTypes.SeriesParams({
            underlying: underlying,
            region: region,
            optionType: optionType,
            strikePrice: strike,
            expiration: block.timestamp + daysToExpiry * 1 days,
            contractSize: 100,
            premium: premium,
            maxPayoutPerUnit: cap,
            maxContracts: maxContracts,
            oracle: address(oracle),
            settlementToken: address(usdc)
        });
    }

    function _writeDeployment(address deployer) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "deployBlock", block.number);
        vm.serializeAddress(key, "deployer", deployer);
        vm.serializeAddress(key, "usdc", address(usdc));
        vm.serializeAddress(key, "oracle", address(oracle));
        vm.serializeAddress(key, "positionNFT", address(nft));
        vm.serializeAddress(key, "vault", address(vault));
        vm.serializeAddress(key, "futures", address(futures));
        string memory json = vm.serializeAddress(key, "optionFactory", address(factory));

        string memory file = string.concat(vm.toString(block.chainid), ".json");
        vm.writeJson(json, string.concat("./deployments/", file));
        vm.writeJson(json, string.concat("../frontend/src/contracts/deployments/", file));
    }
}
