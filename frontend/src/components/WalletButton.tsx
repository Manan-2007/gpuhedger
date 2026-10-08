import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { activeChain, addressUrl } from "../lib/chain";
import { friendlyError } from "../lib/errors";
import { formatNumber, formatUsd, shortAddress } from "../utils/formatters";
import { useMonBalance, useUSDC } from "../hooks/useUSDC";
import { Spinner } from "./ui";

export function useWrongNetwork() {
  const { isConnected, chainId } = useAccount();
  return isConnected && chainId !== activeChain.id;
}

export function SwitchNetworkButton({ className = "" }: { className?: string }) {
  const { switchChain, isPending, error } = useSwitchChain();
  return (
    <div className="flex flex-col items-stretch gap-1">
      <button className={`btn-primary ${className}`} onClick={() => switchChain({ chainId: activeChain.id })} disabled={isPending}>
        {isPending && <Spinner />}
        SWITCH TO {activeChain.name.toUpperCase()}
      </button>
      {error && <span className="text-xs text-neg">{friendlyError(error)}</span>}
    </div>
  );
}

export function ConnectButton({ className = "", label = "CONNECT WALLET" }: { className?: string; label?: string }) {
  const { connectors, connect, isPending, error } = useConnect();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Prefer EIP-6963 discovered wallets (MetaMask, Rabby, Phantom…) over the generic injected entry.
  const discovered = connectors.filter((c) => c.id !== "injected");
  const list = discovered.length > 0 ? discovered : connectors;
  const hasWallet = typeof window !== "undefined" && (Boolean((window as { ethereum?: unknown }).ethereum) || discovered.length > 0);

  const onClick = () => {
    if (list.length === 1) connect({ connector: list[0], chainId: activeChain.id });
    else setOpen((o) => !o);
  };

  return (
    <div ref={ref} className="relative">
      <button className={`btn-primary ${className}`} onClick={onClick} disabled={isPending}>
        {isPending && <Spinner />}
        {label}
      </button>
      {open && (
        <div className="popover absolute right-0 z-50 mt-2 w-64 p-2">
          <div className="label px-2 py-1.5">Choose a wallet</div>
          {list.map((c) => (
            <button
              key={c.uid}
              onClick={() => {
                connect({ connector: c, chainId: activeChain.id });
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-panel-2"
            >
              {c.icon ? <img src={c.icon} alt="" className="h-5 w-5 rounded" /> : <span className="h-5 w-5 rounded bg-line-2" />}
              {c.name === "Injected" ? "Browser wallet" : c.name}
            </button>
          ))}
          {!hasWallet && (
            <p className="px-2 py-2 text-xs text-muted">
              No browser wallet detected. Install{" "}
              <a className="text-secondary underline" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                MetaMask
              </a>{" "}
              to trade.
            </p>
          )}
        </div>
      )}
      {error && !open && <div className="absolute right-0 mt-2 w-64 text-right text-xs text-neg">{friendlyError(error)}</div>}
    </div>
  );
}

export function WalletButton() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const wrong = useWrongNetwork();
  const usdc = useUSDC();
  const mon = useMonBalance();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!isConnected || !address) return <ConnectButton className="px-3 py-2 text-xs sm:px-4 sm:text-sm" label="CONNECT" />;
  if (wrong) return <SwitchNetworkButton className="px-3 py-2 text-xs" />;

  const url = addressUrl(address);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-lg border border-line-2 bg-panel-2 px-3 py-2 text-sm hover:border-dim"
      >
        <span className="hidden num text-xs text-muted sm:inline">{formatUsd(usdc.balance, 0)}</span>
        <span className="h-2 w-2 rounded-full bg-pos" />
        <span className="mono text-xs font-semibold">{shortAddress(address)}</span>
      </button>
      {open && (
        <div className="popover absolute right-0 z-50 mt-2 w-72 p-4">
          <div className="label">Wallet</div>
          <div className="mono mt-1 break-all text-xs text-fg">{address}</div>
          <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Network</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-pos" />
                {chain?.name ?? activeChain.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">MON</span>
              <span className="num">{mon.data ? formatNumber(Number(mon.data.formatted), 4) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">USDC (test)</span>
              <span className="num">{formatUsd(usdc.balance)}</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to="/portfolio" onClick={() => setOpen(false)} className="btn-secondary px-2 py-2 text-xs">
              Portfolio
            </Link>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className="btn-secondary px-2 py-2 text-xs">
                Explorer ↗
              </a>
            ) : (
              <span className="btn-secondary px-2 py-2 text-xs opacity-40">No explorer</span>
            )}
          </div>
          <button
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="btn-ghost mt-2 w-full py-2 text-xs"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
