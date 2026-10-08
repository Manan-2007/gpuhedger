import { createConfig, http } from "wagmi";
import { injected, mock } from "wagmi/connectors";
import { activeChain, isLocalChain } from "./chain";

// Local-only test hook: lets automated E2E runs drive the UI with an unlocked Anvil account.
// Never enabled on Monad Testnet.
const ANVIL_DEV_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const useMockWallet = isLocalChain && import.meta.env.VITE_E2E_MOCK_WALLET === "true";

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: useMockWallet
    ? [mock({ accounts: [ANVIL_DEV_ACCOUNT], features: { reconnect: true } })]
    : [injected({ shimDisconnect: true })],
  transports: {
    [activeChain.id]: http(),
  },
  // Monad produces ~400ms blocks; poll fast so confirmations feel immediate.
  pollingInterval: 400,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
