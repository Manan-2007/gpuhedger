import { useState } from "react";
import { NavLink } from "react-router-dom";
import { activeChain, isLocalChain } from "../lib/chain";
import { isConfigured } from "../contracts/addresses";
import { SwitchNetworkButton, useWrongNetwork, WalletButton } from "./WalletButton";
import { Logo } from "./ui";

const LINKS = [
  { to: "/markets", label: "Markets" },
  { to: "/trade", label: "Trade" },
  { to: "/hedge", label: "Hedge" },
  { to: "/futures", label: "Futures" },
  { to: "/vault", label: "Vault" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/activity", label: "Activity" },
  { to: "/admin", label: "Admin" },
  { to: "/docs", label: "Docs" },
];

export function DemoModeBadge() {
  return (
    <span
      className="chip border-primary/40 bg-primary/10 text-primary"
      title="Market data (24h change, volume, history) is simulated. Wallet, approvals, trades, oracle updates and settlement are real Monad Testnet transactions."
    >
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
      Demo mode
    </span>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const wrong = useWrongNetwork();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-4 hidden items-center gap-0.5 xl:flex">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${isActive ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <DemoModeBadge />
            </div>
            <span className="hidden items-center gap-1.5 text-xs text-muted 2xl:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${isLocalChain ? "bg-warn" : "bg-secondary"}`} />
              {activeChain.name}
            </span>
            <WalletButton />
            <button
              className="grid h-9 w-9 place-items-center rounded-md border border-line-2 xl:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-line px-4 py-3 xl:hidden">
            <div className="mb-3 sm:hidden">
              <DemoModeBadge />
            </div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {LINKS.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-2.5 text-sm font-medium ${isActive ? "bg-panel-2 text-fg" : "text-muted"}`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      {wrong && (
        <div className="border-b border-neg/30 bg-neg/10">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="text-sm font-semibold text-neg">
              WRONG NETWORK — GpuHedger runs on {activeChain.name} (chain {activeChain.id}).
            </span>
            <SwitchNetworkButton className="px-3 py-1.5 text-xs" />
          </div>
        </div>
      )}

      {!isConfigured && (
        <div className="border-b border-warn/30 bg-warn/10">
          <div className="mx-auto max-w-7xl px-4 py-2.5 text-sm text-warn sm:px-6">
            Contracts are not configured for chain {activeChain.id}. Deploy with <code className="num">forge script</code> or
            set the <code className="num">VITE_*_ADDRESS</code> variables. See the README.
          </div>
        </div>
      )}
    </>
  );
}
