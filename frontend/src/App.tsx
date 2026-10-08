import { Suspense, lazy, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { useAccount, useConnect, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { activeChain } from "./lib/chain";
import { syncChainClock } from "./lib/clock";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { useMockWallet } from "./lib/wagmi";
import { Skeleton } from "./components/ui";

// One chunk per route, so the landing page doesn't download the charts bundle.
const LandingPage = lazy(() => import("./pages/LandingPage").then((m) => ({ default: m.LandingPage })));
const MarketsPage = lazy(() => import("./pages/MarketsPage").then((m) => ({ default: m.MarketsPage })));
const MarketDetailPage = lazy(() => import("./pages/MarketDetailPage").then((m) => ({ default: m.MarketDetailPage })));
const TradePage = lazy(() => import("./pages/TradePage").then((m) => ({ default: m.TradePage })));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage").then((m) => ({ default: m.PortfolioPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const DocsPage = lazy(() => import("./pages/DocsPage").then((m) => ({ default: m.DocsPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
const HedgePage = lazy(() => import("./pages/HedgePage").then((m) => ({ default: m.HedgePage })));
const FuturesPage = lazy(() => import("./pages/FuturesPage").then((m) => ({ default: m.FuturesPage })));
const VaultPage = lazy(() => import("./pages/VaultPage").then((m) => ({ default: m.VaultPage })));
const ActivityPage = lazy(() => import("./pages/ActivityPage").then((m) => ({ default: m.ActivityPage })));

function PageFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-10 sm:px-6" aria-busy="true">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Keeps chainNow() aligned with block.timestamp (see lib/clock.ts). */
function ChainClockSync() {
  const client = usePublicClient({ chainId: activeChain.id });
  useQuery({
    queryKey: ["chain-clock", activeChain.id],
    enabled: Boolean(client),
    refetchInterval: 15_000,
    queryFn: async () => {
      const block = await client!.getBlock();
      return syncChainClock(Number(block.timestamp));
    },
  });
  return null;
}

/** Local E2E only: auto-connect the mock Anvil account (see lib/wagmi.ts). */
function MockAutoConnect() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  useEffect(() => {
    if (useMockWallet && !isConnected && connectors[0]) connect({ connector: connectors[0] });
  }, [isConnected, connect, connectors]);
  return null;
}

export function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <MockAutoConnect />
      <ChainClockSync />
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/markets" element={<MarketsPage />} />
            <Route path="/markets/:id" element={<MarketDetailPage />} />
            <Route path="/trade" element={<TradePage />} />
            <Route path="/hedge" element={<HedgePage />} />
            <Route path="/futures" element={<FuturesPage />} />
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
