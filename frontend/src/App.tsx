import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { useAccount, useConnect } from "wagmi";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { useMockWallet } from "./lib/wagmi";
import { LandingPage } from "./pages/LandingPage";
import { MarketsPage } from "./pages/MarketsPage";
import { MarketDetailPage } from "./pages/MarketDetailPage";
import { TradePage } from "./pages/TradePage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { AdminPage } from "./pages/AdminPage";
import { DocsPage } from "./pages/DocsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { HedgePage } from "./pages/HedgePage";
import { FuturesPage } from "./pages/FuturesPage";
import { VaultPage } from "./pages/VaultPage";
import { ActivityPage } from "./pages/ActivityPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
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
      <Navbar />
      <main className="flex-1">
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
      </main>
      <Footer />
    </div>
  );
}
