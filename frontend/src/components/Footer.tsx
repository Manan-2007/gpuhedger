import { Link } from "react-router-dom";
import { activeChain } from "../lib/chain";
import { addresses } from "../contracts/addresses";
import { ExplorerLink, Logo } from "./ui";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted">
            Hedge the future of compute. Onchain options that turn GPU compute from an unpredictable infrastructure expense
            into a hedgeable financial asset.
          </p>
          <p className="mt-4 text-xs text-dim">
            Experimental hackathon software on {activeChain.name}. Test USDC has no value. Market statistics are simulated. Not
            financial advice.
          </p>
        </div>
        <div>
          <div className="label mb-3">Product</div>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-fg" to="/markets">Markets</Link></li>
            <li><Link className="hover:text-fg" to="/trade">Trade</Link></li>
            <li><Link className="hover:text-fg" to="/portfolio">Portfolio</Link></li>
            <li><Link className="hover:text-fg" to="/docs">Docs</Link></li>
          </ul>
        </div>
        <div>
          <div className="label mb-3">Contracts · {activeChain.name}</div>
          <ul className="space-y-2 text-sm">
            {[
              ["OptionFactory", addresses.optionFactory],
              ["ComputeOracle", addresses.oracle],
              ["MockUSDC", addresses.usdc],
            ].map(([name, addr]) => (
              <li key={name} className="flex justify-between gap-3">
                <span className="text-muted">{name}</span>
                {addr ? <ExplorerLink address={addr} /> : <span className="text-dim">not set</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
