// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ComputeOracle} from "../src/ComputeOracle.sol";
import {ComputeOption} from "../src/ComputeOption.sol";
import {OptionFactory} from "../src/OptionFactory.sol";
import {PositionNFT} from "../src/PositionNFT.sol";
import {ComputeVault} from "../src/ComputeVault.sol";
import {ComputeFutures} from "../src/ComputeFutures.sol";
import {GpuHedgerTypes} from "../src/interfaces/IGpuHedger.sol";

/// Tests for expiry settlement & claims, transferable positions, the LP vault and futures.
contract ExtensionsTest is Test {
    MockUSDC usdc;
    ComputeOracle oracle;
    OptionFactory factory;
    PositionNFT nft;
    ComputeVault vault;
    ComputeFutures futures;

    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address lp = makeAddr("lp");
    address provider = makeAddr("provider");

    bytes32 constant H100 = "H100";
    uint256 constant USDC = 1e6;

    function setUp() public {
        vm.warp(1_700_000_000);
        vm.startPrank(admin);
        usdc = new MockUSDC(10_000 * USDC);
        oracle = new ComputeOracle(admin);
        oracle.addAsset(H100, 2_000_000, 4_200);
        nft = new PositionNFT(admin);
        factory = new OptionFactory(
            admin, address(new ComputeOption()), address(nft), address(oracle), address(usdc)
        );
        nft.grantRole(nft.MINTER_ROLE(), address(factory));
        vault = new ComputeVault(usdc, factory, admin);
        factory.grantRole(factory.WRITER_ROLE(), address(vault));
        futures = new ComputeFutures(admin, usdc, oracle);
        usdc.mint(admin, 10_000_000 * USDC);
        usdc.approve(address(factory), type(uint256).max);
        usdc.approve(address(futures), type(uint256).max);
        vm.stopPrank();

        for (uint256 i = 0; i < 4; i++) {
            address who = [alice, bob, lp, provider][i];
            vm.prank(admin);
            usdc.mint(who, 1_000_000 * USDC);
            vm.prank(who);
            usdc.approve(address(futures), type(uint256).max);
        }
    }

    function _params(GpuHedgerTypes.OptionType t, uint256 strike, uint256 days_)
        internal
        view
        returns (GpuHedgerTypes.SeriesParams memory)
    {
        return GpuHedgerTypes.SeriesParams({
            underlying: H100,
            region: "US-East",
            optionType: t,
            strikePrice: strike,
            expiration: block.timestamp + days_ * 1 days,
            contractSize: 100,
            premium: 40_000,
            maxPayoutPerUnit: strike,
            maxContracts: 100,
            oracle: address(oracle),
            settlementToken: address(usdc)
        });
    }

    function _call() internal returns (ComputeOption opt) {
        vm.prank(admin);
        (, address a) = factory.createOptionSeries(_params(GpuHedgerTypes.OptionType.Call, 2_200_000, 30));
        opt = ComputeOption(a);
    }

    function _buy(ComputeOption opt, address who, uint256 n) internal returns (uint256 id) {
        vm.startPrank(who);
        usdc.approve(address(opt), type(uint256).max);
        id = opt.buyOption(n, type(uint256).max);
        vm.stopPrank();
    }

    function _setPrice(uint256 p) internal {
        vm.prank(admin);
        oracle.setPrice(H100, p);
    }

    // ------------------------------------------------------------------
    // Oracle history
    // ------------------------------------------------------------------

    function test_GetPriceAt() public {
        uint256 t0 = 1_700_000_000; // fixed: via-IR re-reads block.timestamp after vm.warp
        vm.warp(t0 + 100);
        _setPrice(3_000_000);
        vm.warp(t0 + 200);
        _setPrice(4_000_000);
        assertEq(oracle.getPriceAt(H100, t0), 2_000_000);
        assertEq(oracle.getPriceAt(H100, t0 + 99), 2_000_000);
        assertEq(oracle.getPriceAt(H100, t0 + 100), 3_000_000);
        assertEq(oracle.getPriceAt(H100, t0 + 150), 3_000_000);
        assertEq(oracle.getPriceAt(H100, t0 + 10_000), 4_000_000);
        vm.expectRevert(abi.encodeWithSelector(ComputeOracle.PriceUnavailable.selector, H100));
        oracle.getPriceAt(H100, t0 - 1);
    }

    // ------------------------------------------------------------------
    // Expiry settlement & claims
    // ------------------------------------------------------------------

    function test_ClaimAfterExpiryUsesPriceAtExpiry() public {
        ComputeOption opt = _call();
        uint256 id = _buy(opt, alice, 10);
        vm.warp(block.timestamp + 10 days);
        _setPrice(3_500_000); // in effect at expiry
        vm.warp(opt.expiration() + 1 days);
        _setPrice(1_000_000); // after expiry: must not affect settlement

        assertEq(uint8(opt.getPosition(id).status), uint8(GpuHedgerTypes.PositionStatus.Claimable));
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        uint256 payout = opt.claim(id); // auto-settles
        assertEq(payout, (3_500_000 - 2_200_000) * 100 * 10);
        assertEq(usdc.balanceOf(alice), before + payout);
        assertEq(opt.settlementPrice(), 3_500_000);
        assertEq(uint8(opt.getPosition(id).status), uint8(GpuHedgerTypes.PositionStatus.Exercised));
        assertEq(factory.totalPayouts(), payout);

        vm.prank(alice);
        vm.expectRevert(ComputeOption.PositionNotOpen.selector);
        opt.claim(id);
    }

    function test_ExpireReservesOwedAndReleasesRestToWriter() public {
        ComputeOption opt = _call();
        uint256 id = _buy(opt, alice, 10);
        _setPrice(3_000_000);
        uint256 total = opt.collateralBalance();
        uint256 writerBefore = usdc.balanceOf(admin);
        vm.warp(opt.expiration());
        opt.expire(); // anyone
        uint256 owed = 800_000 * 100 * 10;
        assertEq(opt.collateralBalance(), owed);
        assertEq(usdc.balanceOf(admin), writerBefore + total - owed);

        vm.prank(alice);
        opt.claim(id);
        assertEq(usdc.balanceOf(address(opt)), 0);
    }

    function test_ClaimRejections() public {
        ComputeOption opt = _call();
        uint256 id = _buy(opt, alice, 1);
        vm.prank(alice);
        vm.expectRevert(ComputeOption.OptionNotExpired.selector);
        opt.claim(id);

        vm.warp(opt.expiration());
        vm.prank(alice); // $2.00 < $2.20 strike
        vm.expectRevert(ComputeOption.OutOfTheMoney.selector);
        opt.claim(id);
        assertEq(uint8(opt.getPosition(id).status), uint8(GpuHedgerTypes.PositionStatus.Expired));
    }

    // ------------------------------------------------------------------
    // Transferable positions
    // ------------------------------------------------------------------

    function test_PositionNftTransferMovesOwnership() public {
        ComputeOption opt = _call();
        uint256 id = _buy(opt, alice, 5);
        uint256 tokenId = opt.positionTokenId(id);
        assertEq(nft.ownerOf(tokenId), alice);
        (address o, uint256 pid) = nft.positionOf(tokenId);
        assertEq(o, address(opt));
        assertEq(pid, id);

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);
        assertEq(opt.getPosition(id).owner, bob);
        assertEq(factory.getUserPositions(alice).length, 0);
        GpuHedgerTypes.UserPosition[] memory bobs = factory.getUserPositions(bob);
        assertEq(bobs.length, 1);
        assertEq(bobs[0].tokenId, tokenId);

        _setPrice(4_000_000);
        vm.prank(alice);
        vm.expectRevert(ComputeOption.NotPositionOwner.selector);
        opt.exercise(id);
        uint256 before = usdc.balanceOf(bob);
        vm.prank(bob);
        opt.exercise(id);
        assertEq(usdc.balanceOf(bob), before + 1_800_000 * 100 * 5);
    }

    function test_TokenUriIsOnchainJson() public {
        ComputeOption opt = _call();
        uint256 id = _buy(opt, alice, 3);
        string memory uri = nft.tokenURI(opt.positionTokenId(id));
        assertEq(bytes(uri).length > 100, true);
        assertEq(_startsWith(uri, "data:application/json;base64,"), true);
    }

    function test_OnlyFactoryCanMint() public {
        vm.expectRevert();
        nft.mint(alice, address(1), 0);
        vm.expectRevert(OptionFactory.OnlySeries.selector);
        factory.mintPosition(alice, 0);
    }

    // ------------------------------------------------------------------
    // LP vault
    // ------------------------------------------------------------------

    function test_VaultEarnsPremiumsForLps() public {
        vm.startPrank(lp);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.deposit(100_000 * USDC, lp);
        vm.stopPrank();
        assertEq(vault.totalAssets(), 100_000 * USDC);

        vm.prank(admin);
        (, address a) = vault.writeSeries(_params(GpuHedgerTypes.OptionType.Call, 2_200_000, 30));
        ComputeOption opt = ComputeOption(a);
        assertEq(opt.writer(), address(vault));
        uint256 collateral = 2_200_000 * 100 * 100;
        assertEq(vault.idleAssets(), 100_000 * USDC - collateral);
        assertEq(vault.totalAssets(), 100_000 * USDC); // collateral still counts

        _buy(opt, alice, 10); // pays 40_000 * 100 * 10 = $40 to the vault
        assertEq(vault.totalAssets(), 100_000 * USDC + 40 * USDC);
        assertGt(vault.convertToAssets(shares), 100_000 * USDC);

        // Withdrawals limited to idle USDC
        assertEq(vault.maxWithdraw(lp), vault.idleAssets());

        // Price spike creates a liability, marked against NAV
        _setPrice(3_200_000);
        assertEq(vault.totalAssets(), 100_000 * USDC + 40 * USDC - 1_000_000 * 100 * 10);

        // Expiry OTM: harvest returns all collateral
        _setPrice(2_000_000);
        vm.warp(opt.expiration());
        vault.harvest(a);
        assertEq(vault.activeSeries().length, 0);
        assertEq(vault.idleAssets(), 100_000 * USDC + 40 * USDC);

        vm.prank(lp);
        uint256 out = vault.redeem(shares, lp, lp);
        assertApproxEqAbs(out, 100_040 * USDC, 1);
    }

    function test_VaultOnlyManagerWrites() public {
        GpuHedgerTypes.SeriesParams memory p = _params(GpuHedgerTypes.OptionType.Call, 2_200_000, 30);
        vm.prank(alice);
        vm.expectRevert();
        vault.writeSeries(p);
    }

    // ------------------------------------------------------------------
    // Futures
    // ------------------------------------------------------------------

    function _market() internal returns (uint256 id) {
        vm.prank(admin);
        // Forward $2.10, band $1.00, 30 days, 100 GPU-h, capacity 50
        id = futures.createMarket(H100, "US-East", 2_100_000, 1_000_000, 1_700_000_000 + 30 days, 100, 50);
    }

    function _open(address who, uint256 market, ComputeFutures.Side side, uint256 n)
        internal
        returns (uint256 id)
    {
        vm.prank(who);
        id = futures.openPosition(market, side, n);
    }

    function test_FuturesLongAndShortSettle() public {
        uint256 m = _market();
        uint256 adminBefore = usdc.balanceOf(admin);
        uint256 longId = _open(alice, m, ComputeFutures.Side.Long, 10); // AI startup locks cost
        uint256 shortId = _open(provider, m, ComputeFutures.Side.Short, 5); // provider locks revenue
        uint256 margin = 1_000_000 * 100;
        assertEq(usdc.balanceOf(alice), 1_000_000 * USDC - margin * 10);

        _setPrice(2_600_000); // +$0.50 vs forward
        vm.warp(1_700_000_000 + 30 days + 1);
        _setPrice(9_000_000); // after expiry, ignored

        uint256 aliceBefore = usdc.balanceOf(alice);
        futures.settlePosition(longId); // anyone can settle
        assertEq(usdc.balanceOf(alice), aliceBefore + margin * 10 + 500_000 * 100 * 10);

        uint256 providerBefore = usdc.balanceOf(provider);
        futures.settlePosition(shortId);
        assertEq(usdc.balanceOf(provider), providerBefore + margin * 5 - 500_000 * 100 * 5);

        // Writer: got back margin-funded P&L legs; remaining unused capacity withdrawable
        vm.prank(admin);
        futures.reduceCapacity(m, 35);
        assertEq(usdc.balanceOf(address(futures)), 0);
        // Writer net = -long gain + short gain = -500k*100*10 + 500k*100*5
        assertEq(
            int256(usdc.balanceOf(admin)) - int256(adminBefore),
            int256(margin * 50) - int256(500_000 * 100 * 10) + int256(500_000 * 100 * 5)
        );

        vm.expectRevert(ComputeFutures.AlreadyClosed.selector);
        futures.settlePosition(longId);
    }

    function test_FuturesMoveIsClampedToBand() public {
        uint256 m = _market();
        uint256 id = _open(alice, m, ComputeFutures.Side.Short, 1);
        _setPrice(6_000_000); // +$3.90 > band
        assertEq(futures.positionPnl(id), -int256(1_000_000 * 100));
        vm.warp(1_700_000_000 + 30 days + 1);
        uint256 before = usdc.balanceOf(alice);
        futures.settlePosition(id);
        assertEq(usdc.balanceOf(alice), before); // lost the full margin, nothing more
    }

    function test_FuturesRejections() public {
        uint256 m = _market();
        vm.expectRevert(abi.encodeWithSelector(ComputeFutures.InsufficientCapacity.selector, 50));
        _open(alice, m, ComputeFutures.Side.Long, 51);
        uint256 id = _open(alice, m, ComputeFutures.Side.Long, 1);
        vm.expectRevert(ComputeFutures.MarketNotExpired.selector);
        futures.settlePosition(id);
        vm.warp(1_700_000_000 + 30 days + 1);
        vm.expectRevert(ComputeFutures.MarketExpired.selector);
        _open(alice, m, ComputeFutures.Side.Long, 1);
        vm.prank(alice);
        vm.expectRevert();
        futures.createMarket(H100, "x", 1, 1, block.timestamp + 1 days, 1, 1);
    }

    function _startsWith(string memory s, string memory prefix) internal pure returns (bool) {
        bytes memory a = bytes(s);
        bytes memory b = bytes(prefix);
        if (a.length < b.length) return false;
        for (uint256 i = 0; i < b.length; i++) {
            if (a[i] != b[i]) return false;
        }
        return true;
    }
}
