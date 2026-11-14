export const NETWORK = (process.env.EXPO_PUBLIC_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
export const CONTRACT_ID = process.env.EXPO_PUBLIC_CONTRACT_ID ?? 'showup.testnet';
export const USDC_ID =
  process.env.EXPO_PUBLIC_USDC_ID ??
  (NETWORK === 'mainnet' ? '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1' : 'usdc.fakes.testnet');
export const RPC_URL = NETWORK === 'mainnet' ? 'https://free.rpc.fastnear.com' : 'https://test.rpc.fastnear.com';
/** Backup for reads when the main public RPC rate-limits us (HTTP 429) or is down. */
export const RPC_BACKUP_URL = NETWORK === 'mainnet' ? 'https://rpc.mainnet.near.org' : 'https://rpc.testnet.near.org';
export const EXPLORER = NETWORK === 'mainnet' ? 'https://nearblocks.io' : 'https://testnet.nearblocks.io';
export const FAUCET = 'https://near-faucet.io/';

export const CARD_FEE = 25n * 10n ** 21n; // 0.025 NEAR
export const EVENT_FEE = 5n * 10n ** 22n; // 0.05 NEAR
