// Local-only end-to-end check of the extension features against a deployed stack:
// expiry settlement + claim, position NFT transfer, LP vault deposit/earn/harvest, and futures.
// Uses Anvil time travel (evm_increaseTime), so run it on a throwaway chain:
//
//   anvil --chain-id 31338 --port 8546
//   (cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8546 --private-key <anvil key> --broadcast)
//   CHAIN_ID=31338 RPC_URL=http://127.0.0.1:8546 node scripts/e2e-extensions.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, formatUnits, http, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const abi = (n) => JSON.parse(readFileSync(join(root, `contracts/out/${n}.sol/${n}.json`), "utf8")).abi;
const chainId = Number(process.env.CHAIN_ID ?? 31338);
if (chainId === 10143) throw new Error("e2e-extensions uses time travel and is local-only");
const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8546";
const d = JSON.parse(readFileSync(join(root, `contracts/deployments/${chainId}.json`), "utf8"));

const chain = defineChain({ id: chainId, name: "local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const pub = createPublicClient({ chain, transport: http() });
const w = (k) => createWalletClient({ account: privateKeyToAccount(k), chain, transport: http() });
// Public Anvil dev keys #0-#3 (local only)
const admin = w("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const alice = w("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const bob = w("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const lp = w("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");

const A = { usdc: abi("MockUSDC"), oracle: abi("ComputeOracle"), factory: abi("OptionFactory"), option: abi("ComputeOption"), nft: abi("PositionNFT"), vault: abi("ComputeVault"), futures: abi("ComputeFutures") };
const H100 = stringToHex("H100", { size: 32 });
const usd = (v) => `$${Number(formatUnits(v, 6)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const read = (address, a, functionName, args = []) => pub.readContract({ address, abi: a, functionName, args });
async function send(wallet, label, address, a, functionName, args = []) {
  const { request } = await pub.simulateContract({ account: wallet.account, address, abi: a, functionName, args });
  const hash = await wallet.writeContract(request);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${label} reverted`);
  console.log(`  ✓ ${label}`);
}
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}
async function warp(seconds) {
  await pub.request({ method: "evm_increaseTime", params: [seconds] });
  await pub.request({ method: "evm_mine", params: [] });
}
const MAX = 2n ** 255n;

console.log(`GpuHedger extension E2E on chain ${chainId}`);
for (const who of [alice, bob, lp]) await send(who, `faucet ${who.account.address.slice(0, 8)}`, d.usdc, A.usdc, "faucet");
await send(lp, "lp: second faucet", d.usdc, A.usdc, "faucet");

// ---- Position NFT transfer + claim after expiry ----
const series = await read(d.optionFactory, A.factory, "getAllSeriesDetails");
const call = series.find((s) => s.underlying === H100 && s.optionType === 0 && s.strikePrice === 2_200_000n);
await send(alice, "alice approves option", d.usdc, A.usdc, "approve", [call.option, MAX]);
await send(alice, "alice buys 10 H100 CALL $2.20", call.option, A.option, "buyOption", [10n, MAX]);
const [mine] = await read(d.optionFactory, A.factory, "getUserPositions", [alice.account.address]);
console.log(`    NFT #${mine.tokenId} → alice; tokenURI ${(await read(d.positionNFT, A.nft, "tokenURI", [mine.tokenId])).slice(0, 40)}…`);
await send(alice, "alice transfers position NFT to bob", d.positionNFT, A.nft, "transferFrom", [alice.account.address, bob.account.address, mine.tokenId]);
assert((await read(d.optionFactory, A.factory, "getUserPositions", [bob.account.address])).length === 1, "bob owns position");

// ---- LP vault ----
await send(lp, "lp approves vault", d.usdc, A.usdc, "approve", [d.vault, MAX]);
await send(lp, "lp deposits $15,000", d.vault, A.vault, "deposit", [15_000_000_000n, lp.account.address]);
const vaultSeries = await read(d.vault, A.vault, "activeSeries");
const navBefore = await read(d.vault, A.vault, "totalAssets");
await send(alice, "alice approves vault series", d.usdc, A.usdc, "approve", [vaultSeries[0], MAX]);
await send(alice, "alice buys 20 from the vault's series", vaultSeries[0], A.option, "buyOption", [20n, MAX]);
const navAfter = await read(d.vault, A.vault, "totalAssets");
assert(navAfter > navBefore, "vault NAV increased by premium");
console.log(`    vault NAV ${usd(navBefore)} → ${usd(navAfter)} (premium earned)`);

// ---- Futures ----
await send(alice, "alice approves futures", d.usdc, A.usdc, "approve", [d.futures, MAX]);
await send(bob, "bob approves futures", d.usdc, A.usdc, "approve", [d.futures, MAX]);
await send(alice, "alice LONG 5 H100 future", d.futures, A.futures, "openPosition", [0n, 0, 5n]);
await send(bob, "bob SHORT 3 H100 future", d.futures, A.futures, "openPosition", [0n, 1, 3n]);

// ---- Price moves, then time passes beyond every expiry ----
await send(admin, "oracle: H100 → $3.00 (before expiry)", d.oracle, A.oracle, "setPrice", [H100, 3_000_000n]);
await warp(61 * 24 * 3600);
await send(admin, "oracle: H100 → $1.00 (after expiry, must be ignored)", d.oracle, A.oracle, "setPrice", [H100, 1_000_000n]);

const pos = await read(call.option, A.option, "getPosition", [mine.position.id]);
assert(pos.status === 3, "position is CLAIMABLE");
const bobBefore = await read(d.usdc, A.usdc, "balanceOf", [bob.account.address]);
await send(bob, "bob claims (auto-settles series)", call.option, A.option, "claim", [mine.position.id]);
const claimed = (await read(d.usdc, A.usdc, "balanceOf", [bob.account.address])) - bobBefore;
assert(claimed === 800_000n * 100n * 10n, `claim paid ${claimed}`);
console.log(`    bob claimed ${usd(claimed)} at settlement price ${usd(await read(call.option, A.option, "settlementPrice"))}`);

const aliceBefore = await read(d.usdc, A.usdc, "balanceOf", [alice.account.address]);
await send(lp, "anyone settles alice's future", d.futures, A.futures, "settlePosition", [0n]);
const longPayout = (await read(d.usdc, A.usdc, "balanceOf", [alice.account.address])) - aliceBefore;
const market = await read(d.futures, A.futures, "getMarket", [0n]);
// forward $2.05, settle $3.00, band $1.00 → +$0.95 × 500 GPU-h on $500 margin
assert(longPayout === 500_000_000n + 950_000n * 500n, `long payout ${longPayout}`);
console.log(`    alice LONG settled at ${usd(market.settlementPrice)}: received ${usd(longPayout)}`);
await send(bob, "bob settles his short", d.futures, A.futures, "settlePosition", [1n]);

for (const s of await read(d.vault, A.vault, "activeSeries")) await send(lp, `harvest vault series ${s.slice(0, 8)}`, d.vault, A.vault, "harvest", [s]);
const shares = await read(d.vault, A.vault, "balanceOf", [lp.account.address]);
const redeemable = await read(d.vault, A.vault, "maxRedeem", [lp.account.address]);
console.log(`    lp shares ${usd(shares)} · redeemable now ${usd(redeemable)} · NAV ${usd(await read(d.vault, A.vault, "totalAssets"))}`);
assert(redeemable === shares, "all LP shares redeemable after harvest");
await send(lp, "lp redeems all shares", d.vault, A.vault, "redeem", [shares, lp.account.address, lp.account.address]);
console.log("EXTENSIONS E2E PASSED");
