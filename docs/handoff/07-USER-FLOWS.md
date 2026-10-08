# 07: User flows

Copy in "quotes" is what the current UI shows [CODE: file named]; keep it or improve it, but keep the meaning.

## Shared: the transaction lifecycle (every write)

Implemented in `hooks/useTransaction.ts` and shown by `components/TransactionStatus.tsx`. [CODE]

| Phase | Trigger | UI headline | Buttons |
|---|---|---|---|
| idle | | (hidden) | action button enabled |
| signature | after `simulateContract` succeeds, the wallet opens | "Signature required — confirm in your wallet" | action button disabled + spinner |
| submitted | wallet returns a hash | "Order submitted to Monad" + hash | disabled |
| confirming | next animation frame, while polling for the receipt every 250 ms | "Confirming onchain…" | disabled |
| confirmed | receipt `status = success` | "SETTLED ✓ in 0.84s" + hash + block + "View on Explorer ↗" + success note | re-enabled; dismiss ✕ |
| failed | simulation revert, wallet rejection, receipt reverted, or a 120 s timeout | "Transaction failed" + friendly message (`lib/errors.ts`) | dismiss ✕; retry possible |

Rules: simulate before opening the wallet (reverts surface as friendly errors without a wallet popup). Never show a hash that didn't come from the wallet. After `confirmed`, invalidate all queries. Settle time = broadcast → receipt, measured in the browser (`performance.now()`). [CODE: useTransaction.ts] Real values on Monad: [UNKNOWN]; locally it was ~0.27–1.1 s. [CHAT]

## 1. Connect wallet

1. Navbar **CONNECT** (one connector → connect directly; several → picker "Choose a wallet"; none → "No browser wallet detected. Install MetaMask to trade.") [CODE: WalletButton.tsx]
2. Connected: pill with USDC balance + address; dropdown shows address, network, MON, USDC (test), Portfolio, Explorer, Disconnect.
3. Pages that need a wallet (Portfolio) show an empty state: "Connect your wallet · Your positions are read directly from the GpuHedger contracts on Monad."

## 2. Wrong network

- Detect: connected and `chainId !== 10143`.
- Global red banner: "WRONG NETWORK — GpuHedger runs on Monad Testnet (chain 10143)." + **SWITCH TO MONAD TESTNET** (`switchChain`; wagmi adds the chain via `wallet_addEthereumChain` if the wallet lacks it). [CODE: Navbar.tsx]
- All write buttons become the switch button. Reads still work (they use our RPC, not the wallet's).
- Error: show `friendlyError` text under the button (e.g. user rejected the switch).

## 3. Get test USDC

- Buttons: Portfolio wallet card "GET TEST USDC · TESTNET ONLY"; trade panel link "GET TEST USDC"; insufficient-balance state "INSUFFICIENT USDC — GET TEST USDC".
- Call `usdc.faucet()`; success note "+$10,000 test USDC". No approval needed.
- No MON for gas: "You have no MON for gas. Get testnet MON ↗" linking to the faucet. [CODE: TradePanel.tsx]

## 4. Browse markets

- `/markets`: three GPU cards (oracle price "oracle · $/GPU-h", 24h/7d/volume tagged **Simulated**), a filter bar (GPU, Type, Region, Expiration ≤14D/15–45D/>45D, Strike min/max, Show expired, Reset), and a table (desktop) or cards (mobile).
- Row click → `/markets/:id`. **BUY CALL / BUY PUT** → `/trade?series=<id>`.
- Loading: skeleton rows. Empty: "No markets match these filters" / "No option series have been created yet." Error: "Couldn't load markets from the OptionFactory…". Not configured: "Contracts not configured".

## 5. Buy an option (P0)

Screen: `/trade` (selector + payoff chart + trade panel) or `/markets/:id`.

1. Select GPU → CALL/PUT → strike chip → expiry chip (only live series; default = nearest-to-money strike, nearest expiry).
2. Quantity (integer ≥ 1; quick picks 1 / 5 / 10 / 25). Show "Covers 1,000 GPU-hours · 470 contracts available".
3. Quote block: Premium/GPU-hour, Premium/contract, **Model price (demo)**, Break-even, **Maximum loss** (red), **Potential profit (capped)** "up to $2,165.00", Collateral backing, **Total cost**.
4. Risk disclosure (verbatim, required): see the copy section below. Checkbox required.
5. Action button, evaluated top to bottom [CODE: TradePanel.tsx]:
   1. not connected → "CONNECT WALLET TO TRADE"
   2. wrong network → "SWITCH TO MONAD TESTNET"
   3. expired / settled → "OPTION EXPIRED" / "SERIES SETTLED" (disabled)
   4. paused → "TRADING PAUSED"
   5. qty 0 → "ENTER QUANTITY"
   6. qty > available → "ONLY {n} CONTRACTS AVAILABLE"
   7. balance < cost → "INSUFFICIENT USDC — GET TEST USDC" (runs the faucet)
   8. not acknowledged → "ACKNOWLEDGE RISK TO CONTINUE"
   9. allowance < cost → "APPROVE $35.00 USDC" → `usdc.approve(seriesAddress, cost)` → note "USDC approved. You can now buy the option."
   10. otherwise → "BUY CALL" / "BUY PUT" → `buyOption(qty, cost)`
6. Success note: "Position opened. View in portfolio →".

Worked numbers for the demo series (H100 CALL $2.20, 10 contracts): cost **$35.00**, break-even **$2.235/h**, max loss **$35.00**, potential profit **up to $2,165.00**, collateral backing **$2,200.00**. [CODE: utils/optionsPricing.ts `summarizeTrade` test vector]

## 6. Exercise (P0)

- `/portfolio` Open tab. Each row: GPU, Type, Strike, Expiry, Contracts, Entry premium, Current value* (model estimate), P&L (green/red), Status, action.
- Action: OTM → disabled "OTM" (tooltip "Out of the money — nothing to exercise yet"); ITM → **EXERCISE** (tooltip "Settle $1,800.00 onchain").
- Expanded detail: oracle price, intrinsic/GPU-h, exercise value now, est. option value, distance to strike %, time remaining, GPU-hours covered, payout.
- After success: a page-level banner (not inside the row): "SETTLED ✓ … H100 CALL $2.20 exercised · payout **$1,800.00** settled in USDC directly to your wallet." The tab switches to **Exercised**. (This placement fixed a real bug: the confirmation used to vanish when the row changed tab. [CHAT])

## 7. Claim after expiry (P1)

- When `now ≥ expiration` and the position was ITM at the expiry price, status **CLAIMABLE** (amber chip) with claim value = `expiryPayoutPerContract × contracts`.
- **CLAIM** → `option.claim(positionId)`. Note: "{label} claimed at the expiry settlement price · payout $X".
- OTM at expiry → status **EXPIRED**, no action, P&L = −premium.
- Testing tip: create a series with a 1-day expiry in Admin, or on Anvil use `evm_increaseTime`. [CODE: scripts/e2e-extensions.mjs]

## 8. Transfer a position

- Expand an Open or Claimable row → "Position NFT #12 · transfer hedge to [0x… recipient address] TRANSFER". Enable only when `isAddress(to)`.
- Call `positionNFT.safeTransferFrom(me, to, tokenId)`. Success: "Position NFT transferred. The recipient now owns the hedge." The row disappears from my portfolio.
- Error mapping: `ERC721InvalidReceiver` → "That address can't receive position NFTs…"

## 9. Size a hedge (P1)

`/hedge`: toggle "I buy compute" (calls / long futures) or "I sell compute" (puts / short futures); GPU; GPU-hours (quick 1,000 / 5,000 / 20,000 / 100,000); "Most you can pay ($/GPU-h)" (default spot × 1.15) or "Least you can accept" (default spot × 0.88); stress price (default spot × 2 or × 0.5).
Output: a **Recommended hedge** card ("BUY THIS HEDGE · $365.00" → `/trade?series=3&qty=50`), metrics (cost of protection, locked max price, hedged cost in stress, saved in stress, "meets your target ✓"), a chart (Unhedged grey, option lime, futures dashed cyan), and a comparison table. Label: "Illustrative". [CODE: pages/HedgePage.tsx]

## 10. Futures open / settle (P1)

- `/futures`: explanation cards (LONG = AI startups lock cost; SHORT = providers lock revenue); market cards (forward, spot, basis %, OI long/short, band); P&L-at-expiry chart; trade panel (LONG/SHORT toggle, contracts, P&L if settled now, max gain/loss ±margin, Premium "None", Margin posted).
- Required checkbox: "I understand futures can lose up to the full margin if the price moves against me by the band or more." [CODE: FuturesPage.tsx]
- Buttons: "APPROVE $1,000.00 MARGIN" → "OPEN LONG" / "OPEN SHORT". After expiry, in "Your futures positions": **SETTLE** (anyone may settle; funds go to the owner).

## 11. Vault deposit / withdraw (P1)

- `/vault`: NAV, share price, idle liquidity ("withdrawable"), deployed, premiums earned, series written; series table with Harvest; deposit/withdraw panel.
- Deposit: amount → "APPROVE USDC" if needed → "DEPOSIT". Shows "You receive X ghLP".
- Withdraw: "Max $Y" link uses `maxWithdraw`; above it → disabled "MAX WITHDRAWABLE $Y".
- Required warning (verbatim): "LPs are option writers: if GPU prices move sharply, holders' payouts come out of vault collateral. Withdrawals are limited to idle liquidity. Testnet only." [CODE: VaultPage.tsx]

## 12. Admin: set price / create series

- `/admin` shows role chips (✓ Oracle / Writer / Pauser / Vault mgr) and Live/Paused. Without roles: "Read-only: the connected wallet has no admin roles… transactions from this wallet would revert."
- Demo flow panel: 10 numbered steps with links.
- Oracle: presets **H100 → $2.00**, **H100 → $4.00 (spike)**, **H100 → $1.50**; per GPU: price + IV + "updated Xs ago", inputs "Set price" / "Set vol". Success: "Oracle updated onchain. Portfolios re-mark on the next block."
- Create series: writer toggle (my wallet / LP vault), GPU, Type, Region, Strike, Expiry days, Contract size, Premium (placeholder = model + 8%), Payout cap (placeholder = strike), Capacity. Preview: Spot, Model price, Premium, **Collateral required**. Validation messages: "Strike must be > 0", "Expiry must be 1–730 days", "Put cap cannot exceed strike", "Premium must be > 0 and below the cap"… Buttons: "APPROVE $110,000 COLLATERAL" → "CREATE SERIES" → "Series is live — view markets →".
- Futures panel, emergency pause, mint 1,000,000 test USDC (owner), series table with "Settle expiry", activity table.

## Exact disclosure copy (keep the meaning; legal-ish tone)

- **Options risk** (before every purchase) [CODE: components/RiskDisclosure.tsx `RISK_TEXT`]:
  > "Options involve risk. Buyers can lose the premium paid. Option values depend on the underlying compute price, volatility, time to expiry, and liquidity. This hackathon implementation is experimental and uses simulated compute markets."
  > Checkbox: "I understand I can lose the entire premium and that this is an experimental testnet product."
  > Line: "Maximum loss (call): premium paid  $35.00"
- **Model price**: "Model price — for demonstration purposes."
- **Portfolio**: "*Current value of open positions is a model estimate (Black-Scholes, floored at exercise value) — not a production market mark. Exercise value uses the live onchain oracle price."
- **Markets**: "Premium/Ask = executable onchain price per GPU-hour. *Bid is indicative (simulated) — secondary trading is on the roadmap."
- **Demo mode badge tooltip**: "Market data (24h change, volume, history) is simulated. Wallet, approvals, trades, oracle updates and settlement are real Monad Testnet transactions."
- **Footer**: "Experimental hackathon software on Monad Testnet. Test USDC has no value. Market statistics are simulated. Not financial advice."
