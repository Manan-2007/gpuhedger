import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { activeChain, isLocalChain } from "../lib/chain";
import { isConfigured } from "../contracts/addresses";
import { SwitchNetworkButton, useWrongNetwork, WalletButton } from "./WalletButton";
import { Logo } from "./ui";

const PRIMARY = [
  { to: "/markets", label: "Markets" },
  { to: "/trade", label: "Trade" },
  { to: "/hedge", label: "Hedge" },
  { to: "/portfolio", label: "Portfolio" },
];

const MORE = [
  { to: "/futures", label: "Futures", desc: "Lock an exact GPU-hour price" },
  { to: "/vault", label: "LP vault", desc: "Earn premiums by writing options" },
  { to: "/activity", label: "Activity", desc: "Every trade and payout onchain" },
  { to: "/docs", label: "Docs", desc: "How the market works" },
  { to: "/admin", label: "Admin", desc: "Oracle and series controls" },
];

const linkClass = (active: boolean) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted hover:text-fg"}`;

export function DemoModeBadge() {
  return (
    <span
      className="chip border-line-2 text-muted"
      title="Market data (24h change, volume, history) is simulated. Wallet, approvals, trades, oracle updates and settlement are real onchain transactions."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warn" />
      Testnet demo
    </span>
  );
}

function NetworkPill() {
  return (
    <span className="hidden items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-muted 2xl:flex" title={`Chain ${activeChain.id}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isLocalChain ? "bg-warn" : "bg-secondary"}`} />
      {activeChain.name}
    </span>
  );
}

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const active = MORE.some((l) => pathname.startsWith(l.to));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className={`${linkClass(active)} flex items-center gap-1`}>
        More
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="popover absolute left-0 z-50 mt-2 w-64 p-1.5">
          {MORE.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              role="menuitem"
              className={({ isActive }) => `block rounded-md px-3 py-2 ${isActive ? "bg-primary/10" : "hover:bg-panel-2"}`}
            >
              {({ isActive }) => (
                <>
                  <div className={`text-sm font-medium ${isActive ? "text-primary" : "text-fg"}`}>{l.label}</div>
                  <div className="text-xs text-muted">{l.desc}</div>
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const wrong = useWrongNetwork();
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Main">
            {PRIMARY.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => linkClass(isActive)}>
                {l.label}
              </NavLink>
            ))}
            <MoreMenu />
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden md:block">
              <DemoModeBadge />
            </div>
            <NetworkPill />
            <WalletButton />
            <button
              className="grid h-9 w-9 place-items-center rounded-md border border-line-2 lg:hidden"
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
          <nav className="border-t border-line px-4 py-4 lg:hidden" aria-label="Main">
            <div className="mb-4 flex flex-wrap items-center gap-2 md:hidden">
              <DemoModeBadge />
              <span className="chip border-line-2 text-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${isLocalChain ? "bg-warn" : "bg-secondary"}`} />
                {activeChain.name}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {PRIMARY.map((l) => (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => `rounded-md px-3 py-2.5 text-sm font-medium ${isActive ? "bg-primary/10 text-primary" : "text-fg"}`}>
                  {l.label}
                </NavLink>
              ))}
            </div>
            <div className="label mb-1 mt-4 px-3">More</div>
            <div className="grid gap-1 sm:grid-cols-2">
              {MORE.map((l) => (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => `rounded-md px-3 py-2 ${isActive ? "bg-primary/10" : ""}`}>
                  {({ isActive }) => (
                    <>
                      <div className={`text-sm font-medium ${isActive ? "text-primary" : "text-fg"}`}>{l.label}</div>
                      <div className="text-xs text-muted">{l.desc}</div>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      {wrong && (
        <div className="border-b border-neg/30 bg-neg/10" role="alert">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="text-sm font-semibold text-neg">
              Wrong network. GpuHedger runs on {activeChain.name} (chain {activeChain.id}). Reads still work; trades are disabled.
            </span>
            <SwitchNetworkButton className="px-3 py-1.5 text-xs" />
          </div>
        </div>
      )}

      {!isConfigured && (
        <div className="border-b border-warn/30 bg-warn/10" role="alert">
          <div className="mx-auto max-w-7xl px-4 py-2.5 text-sm text-warn sm:px-6">
            Contracts aren't deployed on {activeChain.name} (chain {activeChain.id}) yet, so markets, prices and trading are unavailable.
            Run <code className="mono">./start.sh</code> for the local demo.
          </div>
        </div>
      )}
    </>
  );
}
