// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ComputeOracle} from "../src/ComputeOracle.sol";
import {ComputeOption} from "../src/ComputeOption.sol";
import {OptionFactory} from "../src/OptionFactory.sol";
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

        // 3. Factory (deployer gets admin, writer and pauser roles)
        factory = new OptionFactory(deployer, address(new ComputeOption()), address(oracle), address(usdc));

        // 4. Writer collateral for the seeded markets
        usdc.mint(deployer, 5_000_000 * USDC);
        usdc.approve(address(factory), type(uint256).max);

        // 5. Seed option series. Premiums ~= Black-Scholes model price + spread.
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

        vm.stopBroadcast();

        _writeDeployment(deployer);

        console2.log("MockUSDC      ", address(usdc));
        console2.log("ComputeOracle ", address(oracle));
        console2.log("OptionFactory ", address(factory));
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
            GpuHedgerTypes.SeriesParams({
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
            })
        );
    }

    function _writeDeployment(address deployer) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "deployBlock", block.number);
        vm.serializeAddress(key, "deployer", deployer);
        vm.serializeAddress(key, "usdc", address(usdc));
        vm.serializeAddress(key, "oracle", address(oracle));
        string memory json = vm.serializeAddress(key, "optionFactory", address(factory));

        string memory file = string.concat(vm.toString(block.chainid), ".json");
        vm.writeJson(json, string.concat("./deployments/", file));
        vm.writeJson(json, string.concat("../frontend/src/contracts/deployments/", file));
    }
}
