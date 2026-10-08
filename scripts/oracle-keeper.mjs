// Oracle keeper: feeds ComputeOracle with real GPU rental prices.
//
// Samples live on-demand offers from the Vast.ai public marketplace API, computes a trimmed
// median $/GPU-hour per GPU, applies a max-move guard, and pushes changed prices onchain with
// ComputeOracle.setPrices (requires ORACLE_ROLE).
//
//   node scripts/oracle-keeper.mjs                       # dry run against local Anvil deployment
//   node scripts/oracle-keeper.mjs --send                 # submit the update
//   node scripts/oracle-keeper.mjs --send --interval 15   # keep running, every 15 minutes
//
// Monad Testnet:
//   CHAIN_ID=10143 RPC_URL=https://testnet-rpc.monad.xyz ORACLE_KEY=0x... node scripts/oracle-keeper.mjs --send
//
// Options (env): MAX_MOVE_PCT (default 25), MIN_CHANGE_PCT (default 1).
// Note: don't run it during the scripted demo, since it overwrites manual admin prices.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, formatUnits, http, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const SEND = args.includes("--send");
const intervalIdx = args.indexOf("--interval");
const INTERVAL_MIN = intervalIdx >= 0 ? Number(args[intervalIdx + 1]) : 0;
const MAX_MOVE = Number(process.env.MAX_MOVE_PCT ?? 25) / 100;
const MIN_CHANGE = Number(process.env.MIN_CHANGE_PCT ?? 1) / 100;

// Marketplace GPU model names that map to each standardized underlying.
const GPU_MODELS = {
  H100: ["H100 SXM", "H100 NVL", "H100 PCIE"],
  A100: ["A100 SXM4", "A100 PCIE", "A100X"],
  B200: ["B200"],
};
const MIN_OFFERS = 5;

const chainId = Number(process.env.CHAIN_ID ?? 31337);
const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
// Anvil dev account #0 for local use only; on testnet ORACLE_KEY must be provided.
const key = process.env.ORACLE_KEY ?? (chainId === 31337 ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" : undefined);
if (SEND && !key) throw new Error("Set ORACLE_KEY (an account with ORACLE_ROLE) to send updates.");

const deployment = JSON.parse(readFileSync(join(root, `contracts/deployments/${chainId}.json`), "utf8"));
const oracleAbi = JSON.parse(readFileSync(join(root, "contracts/out/ComputeOracle.sol/ComputeOracle.json"), "utf8")).abi;
const chain = defineChain({ id: chainId, name: "target", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const pub = createPublicClient({ chain, transport: http() });

async function fetchOffers(model) {
  const q = JSON.stringify({ gpu_name: { eq: model }, rentable: { eq: true }, type: "on-demand", limit: 300 });
  const res = await fetch(`https://console.vast.ai/api/v0/bundles/?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Vast.ai ${res.status}`);
  const { offers = [] } = await res.json();
  return offers.filter((o) => o.num_gpus > 0 && o.dph_total > 0).map((o) => o.dph_total / o.num_gpus);
}

function trimmedMedian(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * 0.1);
  const core = sorted.slice(cut, sorted.length - cut);
  const mid = Math.floor(core.length / 2);
  return core.length % 2 ? core[mid] : (core[mid - 1] + core[mid]) / 2;
}

async function runOnce() {
  const stamp = new Date().toISOString();
  console.log(`\n[${stamp}] GpuHedger oracle keeper · chain ${chainId} · ${SEND ? "SEND" : "dry run"}`);
  const assets = [];
  const prices = [];
  for (const [gpu, models] of Object.entries(GPU_MODELS)) {
    const samples = (await Promise.all(models.map((m) => fetchOffers(m).catch(() => [])))).flat();
    const current = Number(formatUnits(await pub.readContract({ address: deployment.oracle, abi: oracleAbi, functionName: "getPrice", args: [stringToHex(gpu, { size: 32 })] }), 6));
    if (samples.length < MIN_OFFERS) {
      console.log(`  ${gpu}: only ${samples.length} offers — skipped (oracle stays $${current.toFixed(3)})`);
      continue;
    }
    const market = trimmedMedian(samples);
    // Guard: move at most MAX_MOVE per update so one bad sample can't wreck markets.
    const bounded = Math.min(Math.max(market, current * (1 - MAX_MOVE)), current * (1 + MAX_MOVE));
    const change = (bounded - current) / current;
    const note = bounded !== market ? ` (capped from $${market.toFixed(3)})` : "";
    console.log(`  ${gpu}: ${samples.length} offers · market $${market.toFixed(3)}/GPU-h · oracle $${current.toFixed(3)} → $${bounded.toFixed(3)}${note} (${(change * 100).toFixed(1)}%)`);
    if (Math.abs(change) < MIN_CHANGE) continue;
    assets.push(stringToHex(gpu, { size: 32 }));
    prices.push(BigInt(Math.round(bounded * 1e6)));
  }

  if (assets.length === 0) return console.log("  no updates needed");
  if (!SEND) return console.log(`  dry run: would update ${assets.length} price(s). Re-run with --send.`);

  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain, transport: http() });
  const { request } = await pub.simulateContract({ account: wallet.account, address: deployment.oracle, abi: oracleAbi, functionName: "setPrices", args: [assets, prices] });
  const hash = await wallet.writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ✓ setPrices ${receipt.status} · tx ${hash} · block ${receipt.blockNumber}`);
}

await runOnce();
if (INTERVAL_MIN > 0) {
  console.log(`Running every ${INTERVAL_MIN} minutes. Ctrl+C to stop.`);
  setInterval(() => runOnce().catch((e) => console.error("  update failed:", e.shortMessage ?? e.message)), INTERVAL_MIN * 60_000);
}
