import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useBlockNumber } from "wagmi";
import { activeChain, isLocalChain } from "../lib/chain";
import { chainNow } from "../lib/clock";
import { useNow } from "../hooks/useNow";
import { useAllGpuPrices } from "../hooks/useOracle";
import { useBlockTime } from "../hooks/useBlockTime";
import { formatPrice } from "../utils/formatters";
import { WalletButton } from "./WalletButton";
import { StatusBanners } from "./StatusBanners";
import { Footer } from "./Footer";
import { Icon, type IconName } from "./icons";
import { Ago, Logo } from "./ui";
import { ButtonLink, Chip, MonoLabel } from "./primitives";

const NAV: { group: string; items: { to: string; label: string; icon: IconName }[] }[] = [
  {
    group: "Trade",
    items: [
      { to: "/markets", label: "Markets", icon: "markets" },
      { to: "/trade", label: "Trade", icon: "trade" },
      { to: "/hedge", label: "Hedge", icon: "hedge" },
    ],
  },
  {
    group: "Positions",
    items: [
      { to: "/portfolio", label: "Portfolio", icon: "portfolio" },
      { to: "/activity", label: "Activity", icon: "activity" },
    ],
  },
  {
    group: "Protocol",
    items: [
      { to: "/vault", label: "Vault", icon: "vault" },
      { to: "/futures", label: "Futures", icon: "futures" },
      { to: "/admin", label: "Admin", icon: "admin" },
    ],
  },
  { group: "Support", items: [{ to: "/docs", label: "Docs", icon: "docs" }] },
];

const TITLES: [RegExp, string][] = [
  [/^\/markets\/\d+/, "Market"],
  [/^\/markets/, "Markets"],
  [/^\/trade/, "Trade"],
  [/^\/hedge/, "Hedge calculator"],
  [/^\/portfolio/, "Portfolio"],
  [/^\/activity/, "Activity"],
  [/^\/vault/, "LP vault"],
  [/^\/futures/, "Futures"],
  [/^\/admin/, "Admin"],
  [/^\/docs/, "Docs"],
];

const titleFor = (path: string) => TITLES.find(([re]) => re.test(path))?.[1] ?? "GpuHedger";

function NavItem({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-[2px] px-3 py-2 text-sm transition-colors ${
          isActive ? "bg-primary/[0.07] text-primary before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-primary" : "text-muted hover:bg-panel hover:text-fg"
        }`
      }
    >
      <Icon name={icon} />
      {label}
    </NavLink>
  );
}

/** Pinned sidebar card: the live H100 oracle price and the chain's measured block time. */
function OracleCard() {
  const h100 = useAllGpuPrices().find((p) => p.gpu === "H100");
  const { blockTime } = useBlockTime();
  return (
    <div className="rounded-[4px] border border-line bg-card-2 p-3.5">
      <div className="flex items-center justify-between">
        <MonoLabel>H100 oracle</MonoLabel>
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden />
      </div>
      <div className="num mt-1.5 font-heading text-2xl font-semibold tracking-tight">
        {h100?.price !== undefined ? formatPrice(h100.price) : "—"}
        <span className="ml-1 text-xs font-normal text-dim">/GPU-h</span>
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-dim">
        {h100?.updatedAt ? <>updated <Ago timestamp={h100.updatedAt} /></> : h100?.unavailable ? "oracle unavailable" : "loading…"}
        {blockTime && <> · {blockTime.ms.toLocaleString("en-US")}ms blocks</>}
      </div>
      <ButtonLink to="/trade" arrow className="mt-3 w-full py-2">
        Trade compute
      </ButtonLink>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
        <Logo />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main" onClick={onNavigate}>
        {NAV.map((g, i) => (
          <div key={g.group} className={i > 0 ? "mt-4 border-t border-line pt-4" : ""}>
            <MonoLabel as="div" className="mb-1.5 px-3 text-dim">{g.group}</MonoLabel>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavItem key={it.to} {...it} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 p-3">
        <OracleCard />
      </div>
    </div>
  );
}

/** Mono status readout: chain-aligned clock and the latest block. */
function ChainStatus() {
  useNow(1_000); // re-render every second
  const block = useBlockNumber({ query: { refetchInterval: 5_000 } }).data;
  const t = new Date(chainNow());
  const time = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const tz = t.toLocaleTimeString("en-US", { timeZoneName: "short" }).split(" ").pop();
  return (
    <span className="num hidden font-mono text-[12px] uppercase tracking-[0.08em] text-muted xl:inline">
      {block !== undefined && <>Block {Number(block).toLocaleString("en-US")} · </>}
      {time} {tz}
    </span>
  );
}

/** Layout for every app route: fixed sidebar (≥1024px) or drawer, sticky top bar, content, footer. */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-line bg-bg lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-bg">
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-60">
        <header className="glass sticky top-0 z-30 border-x-0 border-t-0">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button className="grid h-9 w-9 place-items-center rounded-[2px] border border-line-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
              <Icon name="menu" />
            </button>
            <span className="truncate font-heading text-[15px] font-semibold">{titleFor(pathname)}</span>
            <div className="ml-auto flex items-center gap-3">
              <ChainStatus />
              <Chip tone={isLocalChain ? "amber" : "blue"} className="hidden sm:inline-flex" title={`Chain ${activeChain.id}`}>
                {activeChain.name}
              </Chip>
              <WalletButton />
            </div>
          </div>
        </header>
        <StatusBanners />
        <main id="main" className="flex-1">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
