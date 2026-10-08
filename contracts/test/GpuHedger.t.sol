// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ComputeOracle} from "../src/ComputeOracle.sol";
import {ComputeOption} from "../src/ComputeOption.sol";
import {OptionFactory} from "../src/OptionFactory.sol";
import {GpuHedgerTypes} from "../src/interfaces/IGpuHedger.sol";

contract GpuHedgerTest is Test {
    MockUSDC usdc;
    ComputeOracle oracle;
    OptionFactory factory;

    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address mallory = makeAddr("mallory");

    bytes32 constant H100 = "H100";
    bytes32 constant A100 = "A100";
    bytes32 constant B200 = "B200";
    bytes32 constant US_EAST = "US-East";

    uint256 constant USDC = 1e6;
    uint256 constant FAUCET = 10_000 * USDC;

    function setUp() public {
        vm.startPrank(admin);
        usdc = new MockUSDC(FAUCET);
        oracle = new ComputeOracle(admin);
        oracle.addAsset(H100, 2_000_000, 4_200); // $2.00, 42% vol
        oracle.addAsset(A100, 1_300_000, 3_500); // $1.30
        oracle.addAsset(B200, 3_800_000, 5_500); // $3.80
        factory = new OptionFactory(admin, address(new ComputeOption()), address(oracle), address(usdc));
        usdc.mint(admin, 10_000_000 * USDC);
        usdc.approve(address(factory), type(uint256).max);
        vm.stopPrank();

        vm.prank(alice);
        usdc.faucet();
        vm.prank(bob);
        usdc.faucet();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _params(bytes32 asset, GpuHedgerTypes.OptionType t, uint256 strike, uint256 premium, uint256 cap)
        internal
        view
        returns (GpuHedgerTypes.SeriesParams memory)
    {
        return GpuHedgerTypes.SeriesParams({
            underlying: asset,
            region: US_EAST,
            optionType: t,
            strikePrice: strike,
            expiration: block.timestamp + 30 days,
            contractSize: 100,
            premium: premium,
            maxPayoutPerUnit: cap,
            maxContracts: 1_000,
            oracle: address(oracle),
            settlementToken: address(usdc)
        });
    }

    function _createH100Call() internal returns (ComputeOption) {
        vm.prank(admin);
        (, address opt) = factory.createOptionSeries(
            _params(H100, GpuHedgerTypes.OptionType.Call, 2_200_000, 40_000, 2_200_000)
        );
        return ComputeOption(opt);
    }

    function _createH100Put() internal returns (ComputeOption) {
        vm.prank(admin);
        (, address opt) = factory.createOptionSeries(
            _params(H100, GpuHedgerTypes.OptionType.Put, 1_800_000, 30_000, 1_800_000)
        );
        return ComputeOption(opt);
    }

    function _buy(ComputeOption opt, address who, uint256 contracts) internal returns (uint256 id) {
        vm.startPrank(who);
        usdc.approve(address(opt), type(uint256).max);
        id = opt.buyOption(contracts, type(uint256).max);
        vm.stopPrank();
    }

    function _setH100(uint256 price) internal {
        vm.prank(admin);
        oracle.setPrice(H100, price);
    }

    // ------------------------------------------------------------------
    // 1. Deploy
    // ------------------------------------------------------------------

    function test_Deploy() public view {
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.balanceOf(alice), FAUCET);
        assertEq(oracle.getPrice(H100), 2_000_000);
        assertEq(oracle.getPrice(A100), 1_300_000);
        assertEq(oracle.getPrice(B200), 3_800_000);
        assertTrue(factory.approvedOracles(address(oracle)));
        assertTrue(factory.approvedTokens(address(usdc)));
        assertTrue(factory.hasRole(factory.WRITER_ROLE(), admin));
        assertEq(factory.seriesCount(), 0);
    }

    // ------------------------------------------------------------------
    // 2-5. Series creation
    // ------------------------------------------------------------------

    function test_CreateH100Call() public {
        ComputeOption opt = _createH100Call();
        GpuHedgerTypes.OptionDetails memory d = opt.getOptionDetails();
        assertEq(d.seriesId, 0);
        assertEq(d.underlying, H100);
        assertEq(d.region, US_EAST);
        assertEq(uint8(d.optionType), uint8(GpuHedgerTypes.OptionType.Call));
        assertEq(d.strikePrice, 2_200_000);
        assertEq(d.contractSize, 100);
        assertEq(d.writer, admin);
        assertEq(d.factory, address(factory));
        assertEq(factory.getSeries(0), address(opt));
        assertTrue(factory.isSeries(address(opt)));
    }

    function test_CreateA100Option() public {
        vm.prank(admin);
        (uint256 id, address opt) = factory.createOptionSeries(
            _params(A100, GpuHedgerTypes.OptionType.Call, 1_500_000, 20_000, 1_500_000)
        );
        assertEq(id, 0);
        assertEq(ComputeOption(opt).underlying(), A100);
        assertEq(factory.getAllSeriesDetails()[0].underlying, A100);
    }

    function test_CreateCallAndPut_UniqueIds() public {
        ComputeOption c = _createH100Call();
        ComputeOption p = _createH100Put();
        assertEq(c.seriesId(), 0);
        assertEq(p.seriesId(), 1);
        assertEq(uint8(p.optionType()), uint8(GpuHedgerTypes.OptionType.Put));
        assertEq(factory.seriesCount(), 2);
        assertEq(factory.getAllSeries().length, 2);
    }

    function test_CreateRejectsInvalidConfig() public {
        GpuHedgerTypes.SeriesParams memory p =
            _params(H100, GpuHedgerTypes.OptionType.Call, 2_200_000, 40_000, 2_200_000);
        vm.startPrank(admin);

        GpuHedgerTypes.SeriesParams memory bad = p;
        bad.strikePrice = 0;
        vm.expectRevert(OptionFactory.InvalidStrike.selector);
        factory.createOptionSeries(bad);

        bad = _params(H100, GpuHedgerTypes.OptionType.Call, 2_200_000, 40_000, 2_200_000);
        bad.expiration = block.timestamp;
        vm.expectRevert(OptionFactory.InvalidExpiration.selector);
        factory.createOptionSeries(bad);

        bad = _params(H100, GpuHedgerTypes.OptionType.Call, 2_200_000, 40_000, 2_200_000);
        bad.contractSize = 0;
        vm.expectRevert(OptionFactory.InvalidContractSize.selector);
        factory.createOptionSeries(bad);

        bad = _params(H100, GpuHedgerTypes.OptionType.Call, 2_200_000, 0, 2_200_000);
        vm.expectRevert(OptionFactory.InvalidPremium.selector);
        factory.createOptionSeries(bad);

        bad = _params(H100, GpuHedgerTypes.OptionType.Put, 1_800_000, 30_000, 1_900_000); // cap > strike
        vm.expectRevert(OptionFactory.InvalidPayoutCap.selector);
        factory.createOptionSeries(bad);

        bad = _params("TPU", GpuHedgerTypes.OptionType.Call, 2_200_000, 40_000, 2_200_000);
        vm.expectRevert(OptionFactory.UnsupportedUnderlying.selector);
        factory.createOptionSeries(bad);

        bad = _params(H100, GpuHedgerTypes.OptionType.Call, 2_200_000, 40_000, 2_200_000);
        bad.oracle = address(0xBEEF);
        vm.expectRevert(OptionFactory.OracleNotApproved.selector);
        factory.createOptionSeries(bad);

        bad = _params(H100, GpuHedgerTypes.OptionType.Call, 2_200_000, 40_000, 2_200_000);
        bad.settlementToken = address(0);
        vm.expectRevert(OptionFactory.ZeroAddress.selector);
        factory.createOptionSeries(bad);
        vm.stopPrank();
    }

    function test_CreateRejectsUnauthorizedWriter() public {
        GpuHedgerTypes.SeriesParams memory p =
            _params(H100, GpuHedgerTypes.OptionType.Call, 2_200_000, 40_000, 2_200_000);
        bytes32 role = factory.WRITER_ROLE();
        vm.prank(mallory);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, mallory, role)
        );
        factory.createOptionSeries(p);
    }

    // ------------------------------------------------------------------
    // 6-9. Purchases
    // ------------------------------------------------------------------

    function test_BuyCall_PremiumAndPosition() public {
        ComputeOption opt = _createH100Call();
        uint256 adminBefore = usdc.balanceOf(admin);

        uint256 id = _buy(opt, alice, 10);

        uint256 expectedCost = 40_000 * 100 * 10; // $0.04 * 100 GPU-h * 10 = $40
        assertEq(opt.quotePremium(10), expectedCost);
        assertEq(usdc.balanceOf(alice), FAUCET - expectedCost);
        assertEq(usdc.balanceOf(admin), adminBefore + expectedCost); // premium paid to writer

        GpuHedgerTypes.Position memory pos = opt.getPosition(id);
        assertEq(pos.id, 0);
        assertEq(pos.owner, alice);
        assertEq(pos.contracts, 10);
        assertEq(pos.premiumPaid, expectedCost);
        assertEq(uint8(pos.status), uint8(GpuHedgerTypes.PositionStatus.Open));
        assertEq(opt.soldContracts(), 10);
        assertEq(opt.openContracts(), 10);

        GpuHedgerTypes.UserPosition[] memory all = factory.getUserPositions(alice);
        assertEq(all.length, 1);
        assertEq(all[0].option, address(opt));
        assertEq(factory.totalTrades(), 1);
        assertEq(factory.totalPremiumVolume(), expectedCost);
        assertEq(factory.uniqueTraders(), 1);
    }

    function test_BuyPut() public {
        ComputeOption opt = _createH100Put();
        uint256 id = _buy(opt, bob, 5);
        GpuHedgerTypes.Position memory pos = opt.getPosition(id);
        assertEq(pos.owner, bob);
        assertEq(pos.premiumPaid, 30_000 * 100 * 5);
        assertEq(usdc.balanceOf(bob), FAUCET - 30_000 * 100 * 5);
    }

    function test_BuyRejectsInvalidPayment() public {
        ComputeOption opt = _createH100Call();

        // No allowance
        vm.prank(alice);
        vm.expectRevert();
        opt.buyOption(1, type(uint256).max);

        // Insufficient balance
        address broke = makeAddr("broke");
        vm.startPrank(broke);
        usdc.approve(address(opt), type(uint256).max);
        vm.expectRevert();
        opt.buyOption(1, type(uint256).max);
        vm.stopPrank();

        // Zero contracts
        vm.startPrank(alice);
        usdc.approve(address(opt), type(uint256).max);
        vm.expectRevert(ComputeOption.ZeroContracts.selector);
        opt.buyOption(0, type(uint256).max);

        // Slippage guard
        vm.expectRevert(abi.encodeWithSelector(ComputeOption.PremiumExceedsMax.selector, 4_000_000, 1));
        opt.buyOption(1, 1);

        // Over capacity
        vm.expectRevert(abi.encodeWithSelector(ComputeOption.InsufficientCapacity.selector, 1_000));
        opt.buyOption(1_001, type(uint256).max);
        vm.stopPrank();
    }

    function test_BuyRejectsAfterExpiry() public {
        ComputeOption opt = _createH100Call();
        vm.warp(opt.expiration());
        vm.startPrank(alice);
        usdc.approve(address(opt), type(uint256).max);
        vm.expectRevert(ComputeOption.OptionExpired.selector);
        opt.buyOption(1, type(uint256).max);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // 10-14. Exercise
    // ------------------------------------------------------------------

    function test_ProfitableCallExercise() public {
        ComputeOption opt = _createH100Call();
        uint256 id = _buy(opt, alice, 10);
        uint256 balBefore = usdc.balanceOf(alice);

        _setH100(4_000_000); // $2.00 -> $4.00
        assertTrue(opt.isInTheMoney());
        uint256 expected = (4_000_000 - 2_200_000) * 100 * 10; // $1,800
        assertEq(opt.calculateExerciseValue(10), expected);

        vm.prank(alice);
        uint256 payout = opt.exercise(id);

        assertEq(payout, expected);
        assertEq(usdc.balanceOf(alice), balBefore + expected);
        GpuHedgerTypes.Position memory pos = opt.getPosition(id);
        assertEq(uint8(pos.status), uint8(GpuHedgerTypes.PositionStatus.Exercised));
        assertEq(pos.payout, expected);
        assertEq(opt.openContracts(), 0);
        assertEq(opt.exercisedContracts(), 10);
        assertEq(factory.totalExercises(), 1);
        assertEq(factory.totalPayouts(), expected);
    }

    function test_CallPayoutIsCapped() public {
        ComputeOption opt = _createH100Call(); // cap $2.20 per GPU-hour
        uint256 id = _buy(opt, alice, 1);
        _setH100(9_000_000); // intrinsic $6.80 > cap
        vm.prank(alice);
        uint256 payout = opt.exercise(id);
        assertEq(payout, 2_200_000 * 100);
    }

    function test_ProfitablePutExercise() public {
        ComputeOption opt = _createH100Put();
        uint256 id = _buy(opt, bob, 5);
        uint256 balBefore = usdc.balanceOf(bob);

        _setH100(1_200_000); // $2.00 -> $1.20, put strike $1.80
        uint256 expected = (1_800_000 - 1_200_000) * 100 * 5; // $300
        vm.prank(bob);
        assertEq(opt.exercise(id), expected);
        assertEq(usdc.balanceOf(bob), balBefore + expected);
    }

    function test_RejectOutOfTheMoneyExercise() public {
        ComputeOption call = _createH100Call();
        ComputeOption put = _createH100Put();
        uint256 c = _buy(call, alice, 1);
        uint256 p = _buy(put, alice, 1);

        // Spot $2.00: call strike $2.20 OTM, put strike $1.80 OTM
        assertFalse(call.isInTheMoney());
        vm.startPrank(alice);
        vm.expectRevert(ComputeOption.OutOfTheMoney.selector);
        call.exercise(c);
        vm.expectRevert(ComputeOption.OutOfTheMoney.selector);
        put.exercise(p);

        // At-the-money is also not exercisable
        vm.stopPrank();
        _setH100(2_200_000);
        vm.prank(alice);
        vm.expectRevert(ComputeOption.OutOfTheMoney.selector);
        call.exercise(c);
    }

    function test_RejectExpiredExercise() public {
        ComputeOption opt = _createH100Call();
        uint256 id = _buy(opt, alice, 1);
        _setH100(4_000_000);
        vm.warp(opt.expiration());
        assertEq(uint8(opt.getPosition(id).status), uint8(GpuHedgerTypes.PositionStatus.Expired));
        vm.prank(alice);
        vm.expectRevert(ComputeOption.OptionExpired.selector);
        opt.exercise(id);
    }

    function test_PreventDoubleExercise() public {
        ComputeOption opt = _createH100Call();
        uint256 id = _buy(opt, alice, 1);
        _setH100(4_000_000);
        vm.startPrank(alice);
        opt.exercise(id);
        vm.expectRevert(ComputeOption.PositionNotOpen.selector);
        opt.exercise(id);
        vm.stopPrank();
    }

    function test_RejectExerciseByNonOwner() public {
        ComputeOption opt = _createH100Call();
        uint256 id = _buy(opt, alice, 1);
        _setH100(4_000_000);
        vm.prank(mallory);
        vm.expectRevert(ComputeOption.NotPositionOwner.selector);
        opt.exercise(id);

        vm.prank(alice);
        vm.expectRevert(ComputeOption.InvalidPosition.selector);
        opt.exercise(99);
    }

    // ------------------------------------------------------------------
    // 15-16. Oracle
    // ------------------------------------------------------------------

    function test_OracleUpdate() public {
        vm.warp(block.timestamp + 1 hours);
        vm.prank(admin);
        oracle.setPrice(H100, 4_000_000);
        (uint256 price, uint256 ts) = oracle.getPriceWithTimestamp(H100);
        assertEq(price, 4_000_000);
        assertEq(ts, block.timestamp);

        vm.prank(admin);
        oracle.setVolatility(H100, 6_000);
        assertEq(oracle.getVolatility(H100), 6_000);

        ComputeOracle.PricePoint[] memory hist = oracle.getPriceHistory(H100);
        assertEq(hist.length, 2);
        assertEq(hist[1].price, 4_000_000);

        bytes32[] memory assets = new bytes32[](2);
        uint256[] memory prices = new uint256[](2);
        (assets[0], assets[1]) = (A100, B200);
        (prices[0], prices[1]) = (1_400_000, 3_900_000);
        vm.prank(admin);
        oracle.setPrices(assets, prices);
        assertEq(oracle.getPrice(A100), 1_400_000);
        assertEq(oracle.getPrice(B200), 3_900_000);
    }

    function test_RejectUnauthorizedOracleUpdate() public {
        bytes32 role = oracle.ORACLE_ROLE();
        vm.startPrank(mallory);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, mallory, role)
        );
        oracle.setPrice(H100, 100_000_000);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, mallory, role)
        );
        oracle.setVolatility(H100, 1);
        vm.stopPrank();
        assertEq(oracle.getPrice(H100), 2_000_000);
    }

    function test_OracleRejectsInvalidInput() public {
        vm.startPrank(admin);
        vm.expectRevert(ComputeOracle.InvalidPrice.selector);
        oracle.setPrice(H100, 0);
        vm.expectRevert(abi.encodeWithSelector(ComputeOracle.UnsupportedAsset.selector, bytes32("TPU")));
        oracle.setPrice("TPU", 1);
        vm.expectRevert(abi.encodeWithSelector(ComputeOracle.PriceUnavailable.selector, bytes32("TPU")));
        oracle.getPrice("TPU");
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // 17-19. Collateral & settlement
    // ------------------------------------------------------------------

    function test_CollateralLocking() public {
        uint256 adminBefore = usdc.balanceOf(admin);
        ComputeOption opt = _createH100Call();
        uint256 perContract = 2_200_000 * 100; // $220
        uint256 total = perContract * 1_000;

        assertEq(opt.collateralPerContract(), perContract);
        assertEq(usdc.balanceOf(address(opt)), total);
        assertEq(usdc.balanceOf(admin), adminBefore - total);
        assertEq(opt.collateralBalance(), total);

        _buy(opt, alice, 10);
        assertEq(opt.lockedCollateral(), perContract * 10);
        assertEq(opt.reservedCollateral(), perContract * 990);
        assertEq(opt.freeCollateral(), 0);

        // Writer cannot withdraw locked collateral: reducing capacity beyond unsold fails
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(ComputeOption.InsufficientCapacity.selector, 990));
        opt.reduceCapacity(991);
        vm.expectRevert(ComputeOption.NothingToWithdraw.selector);
        opt.withdrawFreeCollateral();
        vm.stopPrank();

        // Non-writer cannot touch collateral
        vm.prank(mallory);
        vm.expectRevert(ComputeOption.OnlyWriter.selector);
        opt.reduceCapacity(1);

        // Expire cannot be called early
        vm.expectRevert(ComputeOption.OptionNotExpired.selector);
        opt.expire();
    }

    function test_CollateralRelease() public {
        ComputeOption opt = _createH100Call();
        uint256 perContract = opt.collateralPerContract();
        _buy(opt, alice, 10);

        // Writer releases unsold capacity
        uint256 before = usdc.balanceOf(admin);
        vm.prank(admin);
        opt.reduceCapacity(990);
        assertEq(usdc.balanceOf(admin), before + perContract * 990);
        assertEq(opt.maxContracts(), 10);
        assertEq(opt.collateralBalance(), perContract * 10);

        // After expiry, the remaining locked collateral is released to the writer
        vm.warp(opt.expiration());
        before = usdc.balanceOf(admin);
        vm.prank(mallory); // anyone may trigger expiry
        opt.expire();
        assertEq(usdc.balanceOf(admin), before + perContract * 10);
        assertEq(usdc.balanceOf(address(opt)), 0);
        assertTrue(opt.settled());

        vm.expectRevert(ComputeOption.AlreadySettled.selector);
        opt.expire();
    }

    function test_FreeCollateralAfterPartialPayout() public {
        ComputeOption opt = _createH100Call();
        uint256 id = _buy(opt, alice, 10);
        _setH100(3_000_000); // payout $0.80/unit, cap $2.20 -> $1.40/unit freed
        vm.prank(alice);
        opt.exercise(id);

        uint256 freed = (2_200_000 - 800_000) * 100 * 10;
        assertEq(opt.freeCollateral(), freed);
        uint256 before = usdc.balanceOf(admin);
        vm.prank(admin);
        opt.withdrawFreeCollateral();
        assertEq(usdc.balanceOf(admin), before + freed);
        assertEq(opt.collateralBalance(), opt.reservedCollateral());
    }

    function test_SettlementTransferAccounting() public {
        ComputeOption opt = _createH100Call();
        uint256 initial = usdc.balanceOf(address(opt));
        uint256 id = _buy(opt, alice, 10);
        _setH100(4_000_000);
        vm.prank(alice);
        uint256 payout = opt.exercise(id);

        assertEq(usdc.balanceOf(address(opt)), initial - payout);
        assertEq(opt.collateralBalance(), initial - payout);
        assertEq(opt.totalPaidOut(), payout);
        // Contract always holds at least what it owes open positions
        assertGe(usdc.balanceOf(address(opt)), opt.lockedCollateral() + opt.reservedCollateral());
    }

    // ------------------------------------------------------------------
    // 20. Multiple users
    // ------------------------------------------------------------------

    function test_MultipleUsers() public {
        ComputeOption call = _createH100Call();
        ComputeOption put = _createH100Put();

        uint256 a1 = _buy(call, alice, 10);
        uint256 b1 = _buy(call, bob, 20);
        uint256 b2 = _buy(put, bob, 5);
        uint256 a2 = _buy(call, alice, 3);

        assertEq(call.positionCount(), 3);
        assertEq(call.getUserPositionIds(alice).length, 2);
        assertEq(factory.getUserPositions(bob).length, 2);
        assertEq(factory.getUserPositions(alice).length, 2);
        assertEq(factory.uniqueTraders(), 2);
        assertEq(factory.totalTrades(), 4);
        assertEq(call.openContracts(), 33);

        _setH100(3_000_000);
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        call.exercise(a1);
        vm.prank(bob);
        call.exercise(b1);
        assertEq(usdc.balanceOf(alice), aliceBefore + 800_000 * 100 * 10);

        // Bob's put is OTM at $3.00
        vm.prank(bob);
        vm.expectRevert(ComputeOption.OutOfTheMoney.selector);
        put.exercise(b2);

        // Alice cannot exercise Bob's position
        vm.prank(alice);
        vm.expectRevert(ComputeOption.NotPositionOwner.selector);
        call.exercise(b1);

        assertEq(call.openContracts(), 3);
        assertEq(uint8(call.getPosition(a2).status), uint8(GpuHedgerTypes.PositionStatus.Open));

        GpuHedgerTypes.Activity[] memory act = factory.getRecentActivity(10);
        assertEq(act.length, 8); // 2 creations, 4 purchases, 2 exercises
        assertEq(uint8(act[0].kind), uint8(GpuHedgerTypes.ActivityKind.Exercise));
    }

    // ------------------------------------------------------------------
    // Pausing, faucet, access control
    // ------------------------------------------------------------------

    function test_PauseBlocksTradingAndExercise() public {
        ComputeOption opt = _createH100Call();
        uint256 id = _buy(opt, alice, 1);
        _setH100(4_000_000);

        vm.prank(admin);
        factory.pause();

        vm.startPrank(alice);
        vm.expectRevert(ComputeOption.ProtocolPaused.selector);
        opt.buyOption(1, type(uint256).max);
        vm.expectRevert(ComputeOption.ProtocolPaused.selector);
        opt.exercise(id);
        vm.stopPrank();

        vm.prank(mallory);
        vm.expectRevert();
        factory.unpause();

        vm.prank(admin);
        factory.unpause();
        vm.prank(alice);
        opt.exercise(id);
    }

    function test_CloneCannotBeReinitialized() public {
        ComputeOption opt = _createH100Call();
        GpuHedgerTypes.SeriesParams memory p = _params(H100, GpuHedgerTypes.OptionType.Call, 1, 1, 2);
        vm.prank(mallory);
        vm.expectRevert(bytes4(keccak256("InvalidInitialization()")));
        opt.initialize(0, mallory, p);

        ComputeOption impl = ComputeOption(factory.optionImplementation());
        vm.expectRevert(bytes4(keccak256("InvalidInitialization()")));
        impl.initialize(0, mallory, p);
    }

    function test_OnlySeriesCanRecordActivity() public {
        vm.prank(mallory);
        vm.expectRevert(OptionFactory.OnlySeries.selector);
        factory.recordActivity(GpuHedgerTypes.ActivityKind.Purchase, mallory, 1, 1);
    }

    function test_FaucetCooldownAndAmount() public {
        vm.prank(admin);
        usdc.setFaucetCooldown(1 hours);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.FaucetOnCooldown.selector, block.timestamp + 1 hours));
        usdc.faucet();

        vm.warp(block.timestamp + 1 hours);
        vm.prank(alice);
        usdc.faucet();
        assertEq(usdc.balanceOf(alice), 2 * FAUCET);

        vm.prank(mallory);
        vm.expectRevert();
        usdc.setFaucetAmount(1);
    }

    // ------------------------------------------------------------------
    // Fuzz: payout never exceeds collateral
    // ------------------------------------------------------------------

    function testFuzz_PayoutBoundedByCollateral(uint256 spot, uint256 contracts, bool isCall) public {
        spot = bound(spot, 1, 10_000e6);
        contracts = bound(contracts, 1, 1_000);
        vm.prank(admin);
        ComputeOption opt;
        if (isCall) {
            (, address a) = factory.createOptionSeries(
                _params(H100, GpuHedgerTypes.OptionType.Call, 2_200_000, 40_000, 2_200_000)
            );
            opt = ComputeOption(a);
        } else {
            (, address a) = factory.createOptionSeries(
                _params(H100, GpuHedgerTypes.OptionType.Put, 1_800_000, 30_000, 1_800_000)
            );
            opt = ComputeOption(a);
        }
        vm.prank(admin);
        usdc.mint(alice, 1_000_000 * USDC);
        uint256 id = _buy(opt, alice, contracts);
        _setH100(spot);

        uint256 value = opt.calculateExerciseValue(contracts);
        assertLe(value, opt.collateralPerContract() * contracts);
        if (value > 0) {
            vm.prank(alice);
            opt.exercise(id);
            assertGe(usdc.balanceOf(address(opt)), opt.lockedCollateral());
        }
    }
}
