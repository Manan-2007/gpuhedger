/** [phase, title, description, status shown on the card (if any)] */
export const ROADMAP: readonly (readonly [string, string, string, string?])[] = [
  ["Phase 1", "Testnet MVP", "Collateralized GPU calls & puts, oracle, settlement with automatic expiry claims.", "Built"],
  ["Phase 2", "Real compute price oracle", "Oracle updater fed by live GPU rental marketplace prices; next, decentralized reporters.", "Prototype"],
  ["Phase 3", "Liquidity providers", "ERC-4626 LP vault writes options with pooled USDC; next, permissionless writers.", "Prototype"],
  ["Phase 4", "Secondary option trading", "Positions are transferable ERC-721s today; next, an onchain order book.", "Partial"],
  ["Phase 5", "GPU futures", "Fully margined forwards that lock in a fixed compute price.", "Prototype"],
  ["Phase 6", "Compute-backed lending", "Borrow against reserved GPU capacity."],
  ["Phase 7", "SLA insurance", "Coverage for downtime and delivery failures."],
  ["Phase 8", "Institutional compute hedging", "Hedging desks and reporting for AI labs and clouds."],
];
