// End-to-end check of the core GpuHedger demo flow against a deployed stack.
//
//   node scripts/demo-flow.mjs                     # local Anvil (uses well-known Anvil dev keys)
//   RPC_URL=... BUYER_KEY=0x... ADMIN_KEY=0x... CHAIN_ID=10143 node scripts/demo-flow.mjs
//
// Flow: faucet → approve → buy H100 $2.20 CALL → oracle $2.00 → $4.00 → exercise → verify payout.
// Every step is a real transaction; the script asserts onchain balances at the end.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, formatUnits, http, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const abi = (name) => JSON.parse(readFileSync(join(root, `contracts/out/${name}.sol/${name}.json`), "utf8")).abi;

const chainId = Number(process.env.CHAIN_ID ?? 31337);
const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const deployment = JSON.parse(readFileSync(join(root, `contracts/deployments/${chainId}.json`), "utf8"));
// Anvil dev accounts #0 (deployer/admin) and #1 (buyer). Public test keys — local only.
const ADMIN_KEY = process.env.ADMIN_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const BUYER_KEY = process.env.BUYER_KEY ?? "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const chain = defineChain({ id: chainId, name: "target", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const pub = createPublicClient({ chain, transport: http(), pollingInterval: 250 });
const admin = createWalletClient({ account: privateKeyToAccount(ADMIN_KEY), chain, transport: http() });
const buyer = createWalletClient({ account: privateKeyToAccount(BUYER_KEY), chain, transport: http() });

const usdcAbi = abi("MockUSDC");
const oracleAbi = abi("ComputeOracle");
const factoryAbi = abi("OptionFactory");
const optionAbi = abi("ComputeOption");
const H100 = stringToHex("H100", { size: 32 });
const usd = (v) => `$${Number(formatUnits(v, 6)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

async function send(wallet, label, address, abi, functionName, args = []) {
  const { request } = await pub.simulateContract({ account: wallet.account, address, abi, functionName, args });
  const t0 = performance.now();
  const hash = await wallet.writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
  console.log(`  ✓ ${label.padEnd(34)} ${hash.slice(0, 12)}… block ${receipt.blockNumber} (${Math.round(performance.now() - t0)}ms)`);
  return receipt;
}

const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });

console.log(`GpuHedger demo flow on chain ${chainId}`);
const series = await read(deployment.optionFactory, factoryAbi, "getAllSeriesDetails");
const call = series.find((s) => s.underlying === H100 && s.optionType === 0 && s.strikePrice === 2_200_000n && !s.settled);
if (!call) throw new Error("H100 $2.20 CALL series not found");
console.log(`  series #${call.seriesId} at ${call.option}`);

await send(admin, "Oracle: H100 → $2.00", deployment.oracle, oracleAbi, "setPrice", [H100, 2_000_000n]);
await send(buyer, "Faucet: get test USDC", deployment.usdc, usdcAbi, "faucet");
const contracts = 10n;
const cost = call.premium * call.contractSize * contracts;
await send(buyer, `Approve ${usd(cost)} USDC`, deployment.usdc, usdcAbi, "approve", [call.option, cost]);
await send(buyer, `Buy ${contracts} H100 CALL @ $2.20`, call.option, optionAbi, "buyOption", [contracts, cost]);

const positions = await read(call.option, optionAbi, "getUserPositions", [buyer.account.address]);
const pos = positions[positions.length - 1];
console.log(`  position #${pos.id}: ${pos.contracts} contracts, premium ${usd(pos.premiumPaid)}`);

let otmRejected = false;
try {
  await pub.simulateContract({ account: buyer.account, address: call.option, abi: optionAbi, functionName: "exercise", args: [pos.id] });
} catch (e) {
  otmRejected = /OutOfTheMoney/.test(e.message);
}
console.log(`  ✓ OTM exercise rejected at $2.00: ${otmRejected}`);
if (!otmRejected) throw new Error("expected OutOfTheMoney revert");

await send(admin, "Oracle: H100 $2.00 → $4.00", deployment.oracle, oracleAbi, "setPrice", [H100, 4_000_000n]);
const value = await read(call.option, optionAbi, "calculateExerciseValue", [pos.contracts]);
console.log(`  exercise value now ${usd(value)} (ITM: ${await read(call.option, optionAbi, "isInTheMoney")})`);

const before = await read(deployment.usdc, usdcAbi, "balanceOf", [buyer.account.address]);
await send(buyer, "Exercise → settle in USDC", call.option, optionAbi, "exercise", [pos.id]);
const after = await read(deployment.usdc, usdcAbi, "balanceOf", [buyer.account.address]);
const settled = await read(call.option, optionAbi, "getPosition", [pos.id]);

const expected = (4_000_000n - 2_200_000n) * call.contractSize * contracts;
if (after - before !== expected) throw new Error(`payout mismatch: got ${after - before}, expected ${expected}`);
if (settled.status !== 1) throw new Error("position not marked exercised");
console.log(`  ✓ SETTLED: received ${usd(after - before)} · net P&L ${usd(after - before - cost)} · status EXERCISED`);

// Reset the oracle so the UI demo starts from $2.00 again.
await send(admin, "Oracle: H100 → $2.00 (reset)", deployment.oracle, oracleAbi, "setPrice", [H100, 2_000_000n]);
const stats = await read(deployment.optionFactory, factoryAbi, "getStats");
console.log(`  protocol: ${stats[0]} series · ${stats[1]} trades · ${usd(stats[3])} premium · ${stats[4]} exercises · ${usd(stats[5])} paid out`);
console.log("DEMO FLOW PASSED");
