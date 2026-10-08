import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
  ChainMismatchError,
} from "viem";

/** Human-readable messages for protocol and OpenZeppelin custom errors. */
const REVERT_MESSAGES: Record<string, string> = {
  // ComputeOption
  OutOfTheMoney: "This option is out of the money at the current oracle price, so there is nothing to exercise.",
  OptionExpired: "This option has expired. Expired options can no longer be bought or exercised.",
  OptionNotExpired: "This series hasn't expired yet, so its collateral is still locked.",
  PositionNotOpen: "This position has already been exercised or closed.",
  NotPositionOwner: "Only the wallet that owns this position can exercise it.",
  InvalidPosition: "That position doesn't exist in this series.",
  ProtocolPaused: "Trading is temporarily paused by the protocol admin.",
  InsufficientCapacity: "Not enough collateralized contracts left in this series. Try a smaller quantity.",
  ZeroContracts: "Enter at least 1 contract.",
  PremiumExceedsMax: "The premium changed and now exceeds your limit. Please review the quote and retry.",
  AlreadySettled: "This series has already been settled.",
  OnlyWriter: "Only the series writer can manage its collateral.",
  NothingToWithdraw: "There is no free collateral to withdraw.",
  // Oracle
  PriceUnavailable: "The compute price oracle is unavailable for this GPU. Try again shortly.",
  UnsupportedAsset: "This GPU isn't supported by the oracle.",
  InvalidPrice: "Enter a price greater than $0 and below $10,000 per GPU-hour.",
  InvalidVolatility: "Volatility must be between 0.01% and 500%.",
  // Factory
  InvalidStrike: "Strike price must be greater than zero.",
  InvalidExpiration: "Expiration must be in the future (and within 2 years).",
  InvalidContractSize: "Contract size must be between 1 and 1,000,000 GPU-hours.",
  InvalidPremium: "Premium must be positive and below the maximum payout per GPU-hour.",
  InvalidPayoutCap: "Invalid payout cap. A put's cap cannot exceed its strike.",
  InvalidCapacity: "Capacity must be at least 1 contract.",
  UnsupportedUnderlying: "The oracle doesn't support this GPU.",
  OracleNotApproved: "This oracle isn't approved by the factory.",
  TokenNotApproved: "This settlement token isn't approved by the factory.",
  // Futures
  MarketExpired: "This futures market has expired. New positions can't be opened.",
  MarketNotExpired: "This futures market hasn't expired yet, so it can't settle.",
  AlreadyClosed: "This futures position has already been settled.",
  InvalidMarket: "That futures market doesn't exist.",
  InvalidParams: "Invalid market parameters. The band must be positive and no larger than the forward price.",
  // Vault
  NotVaultSeries: "That series wasn't written by the LP vault.",
  WrongSettlementToken: "The vault can only write series settled in its own asset (USDC).",
  TooManyActiveSeries: "The vault has too many active series. Harvest expired ones first.",
  ERC4626ExceededMaxWithdraw: "That's more than you can withdraw right now. Withdrawals are limited to idle vault liquidity.",
  ERC4626ExceededMaxRedeem: "That's more than you can redeem right now. Withdrawals are limited to idle vault liquidity.",
  // Position NFTs
  ERC721InvalidReceiver: "That address can't receive position NFTs (it's a contract without ERC-721 support).",
  ERC721InsufficientApproval: "You don't own this position NFT.",
  ERC721NonexistentToken: "That position NFT doesn't exist.",
  // Faucet
  FaucetOnCooldown: "Faucet cooldown active. Try again a little later.",
  // OpenZeppelin
  ERC20InsufficientBalance: "Insufficient USDC balance. Use GET TEST USDC to top up.",
  ERC20InsufficientAllowance: "USDC allowance is too low. Approve USDC first.",
  AccessControlUnauthorizedAccount: "Your connected wallet isn't authorized to perform this admin action.",
  EnforcedPause: "The protocol is paused.",
  ExpectedPause: "The protocol is not paused.",
  OwnableUnauthorizedAccount: "Only the contract owner can do this.",
};

export function friendlyError(error: unknown): string {
  if (!error) return "Something went wrong.";

  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return "You rejected the request in your wallet. Nothing was submitted.";
    }
    if (error.walk((e) => e instanceof InsufficientFundsError)) {
      return "Not enough MON to pay for gas. Get testnet MON from the Monad faucet.";
    }
    if (error.walk((e) => e instanceof ChainMismatchError)) {
      return "Your wallet is on the wrong network. Switch to Monad Testnet and retry.";
    }
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name];
      if (revert.reason) return `Transaction reverted: ${revert.reason}`;
      if (name) return `Transaction reverted (${name}).`;
    }
    const msg = error.shortMessage || error.message;
    if (/user (rejected|denied)/i.test(msg)) return "You rejected the request in your wallet. Nothing was submitted.";
    if (/insufficient funds/i.test(msg)) return "Not enough MON to pay for gas. Get testnet MON from the Monad faucet.";
    return msg;
  }

  if (error instanceof Error) {
    if (/user (rejected|denied)/i.test(error.message)) {
      return "You rejected the request in your wallet. Nothing was submitted.";
    }
    return error.message;
  }
  return String(error);
}
