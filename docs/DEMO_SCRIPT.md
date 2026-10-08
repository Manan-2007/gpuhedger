# GpuHedger: 2-minute demo script

**Setup before recording:** deployer wallet connected (it holds the admin roles) with test USDC. H100 oracle at **$2.00** (Admin → *H100 → $2.00*). Open tabs: `/`, `/hedge`, `/trade?series=0`, `/portfolio`, `/admin`, `/activity`. Don't run the oracle keeper while recording.

| Time | Screen | Say | Do |
|---|---|---|---|
| 0:00 | Landing | "AI companies spend billions on GPUs, and the price of an H100-hour swings with every model launch. There's no way to hedge it. GpuHedger is an onchain options market for GPU compute, built on Monad." | Scroll past the live oracle widget |
| 0:15 | `/hedge` | "Say we're an AI startup that needs 5,000 H100 hours next month. Today that's $10,000. If prices double, it's $20,000." | Enter 5,000 hours, stress price $4.00 |
| 0:30 | `/hedge` | "GpuHedger recommends a hedge: for about $365, our cost is capped near $2.07 an hour. In the spike, it saves us about $9,600." | Point at the chart: flat yellow line vs. rising grey |
| 0:45 | `/trade` | "Here's a simpler version live. An H100 call, strike $2.20, 30 days. Every number is from the contracts. The payoff chart shows max loss is just the premium." | Select H100 → CALL → $2.20 → 30D, qty 10, tick the risk box |
| 1:00 | `/trade` | "Approve, buy, and on Monad it settles in under a second." | **APPROVE → BUY CALL**, wait for **SETTLED ✓** and the time, click *View on Explorer* |
| 1:10 | `/portfolio` | "The position is an NFT in my wallet. It's out of the money right now, so it's just insurance." | Show OTM row |
| 1:20 | `/admin` | "Now the GPU market spikes: H100 goes from $2 to $4." | Click **H100 → $4.00 (spike)** |
| 1:30 | `/portfolio` | "The hedge is deep in the money. Exercise…" | Click **EXERCISE** |
| 1:40 | `/portfolio` | "…and $1,800 lands in our wallet in about a second. Our compute bill went up $2,000; the hedge covered $1,765 of it net." | Show **SETTLED ✓**, payout, Exercised tab |
| 1:50 | `/activity` | "Every trade and payout is onchain, linked to its transaction. Futures and an LP vault are live too. GpuHedger: hedge the future of compute." | Scroll the activity table |

## Backup lines for Q&A
- **Where does the price come from?** A permissioned oracle for the hackathon, fed by `scripts/oracle-keeper.mjs` from live GPU rental marketplace prices. The interface is swappable for a decentralized feed.
- **Who's on the other side?** Writers who post full collateral, either directly or through the ERC-4626 LP vault that earns the premiums.
- **What if I forget to exercise?** At expiry the series settles at the oracle price recorded at that moment, and in-the-money holders claim their payout.
- **Why Monad?** ~400ms blocks and ~800ms finality make hedging feel like a trading venue, and low fees make 100-GPU-hour contracts viable.
- **First customers?** AI startups spending $50k+/month on GPU rentals, then the GPU clouds that want to hedge rental revenue with puts and shorts.
