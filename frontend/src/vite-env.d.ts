/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_MONAD_RPC_URL?: string;
  readonly VITE_EXPLORER_URL?: string;
  readonly VITE_USDC_ADDRESS?: string;
  readonly VITE_ORACLE_ADDRESS?: string;
  readonly VITE_OPTION_FACTORY_ADDRESS?: string;
  readonly VITE_E2E_MOCK_WALLET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
