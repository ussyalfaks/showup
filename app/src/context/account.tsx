import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { deleteItem, getItem, setItem } from '@/lib/storage';
import { nearBalance, newImplicitAccount, signer } from '@/lib/near';

const STORE_KEY = 'showup.account.v1';
const ONBOARDED_KEY = 'showup.onboarded.v1';

interface Stored {
  accountId: string;
  secretKey: string;
}

interface AccountState {
  ready: boolean;
  /** False until the person creates or imports a wallet in onboarding. */
  hasWallet: boolean;
  /** True once onboarding is finished (or a wallet already existed before onboarding shipped). */
  onboarded: boolean;
  finishOnboarding: () => Promise<void>;
  accountId: string | null;
  secretKey: string | null;
  publicKey: string | null;
  /** yoctoNEAR; null = account not on-chain yet (send it some NEAR or claim a card). */
  balance: bigint | null;
  refreshBalance: () => Promise<void>;
  createAccount: () => Promise<string>;
  importAccount: (accountId: string, secretKey: string) => Promise<void>;
  /** Removes the wallet from this phone and returns to onboarding. */
  resetAccount: () => Promise<void>;
  account: () => ReturnType<typeof signer>;
}

const Ctx = createContext<AccountState | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(null);
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    (async () => {
      // First launch shows onboarding: the person chooses to create or import a wallet.
      const raw = await getItem(STORE_KEY).catch(() => null);
      const flag = await getItem(ONBOARDED_KEY).catch(() => null);
      setStored(raw ? (JSON.parse(raw) as Stored) : null);
      setOnboarded(!!flag || !!raw); // people who already had a wallet skip onboarding
      setReady(true);
    })();
  }, []);

  const refreshBalance = useCallback(async () => {
    setBalance(stored ? await nearBalance(stored.accountId) : null);
  }, [stored]);

  const createAccount = useCallback(async () => {
    const s = newImplicitAccount();
    await setItem(STORE_KEY, JSON.stringify(s));
    setStored(s);
    return s.accountId;
  }, []);

  useEffect(() => {
    refreshBalance();
    const t = setInterval(refreshBalance, 15_000);
    return () => clearInterval(t);
  }, [refreshBalance]);

  const importAccount = useCallback(async (accountId: string, secretKey: string) => {
    KeyPair.fromString(secretKey.trim() as KeyPairString); // throws if invalid
    const s = { accountId: accountId.trim(), secretKey: secretKey.trim() };
    await setItem(STORE_KEY, JSON.stringify(s));
    setStored(s);
  }, []);

  const finishOnboarding = useCallback(async () => {
    await setItem(ONBOARDED_KEY, '1');
    setOnboarded(true);
  }, []);

  const resetAccount = useCallback(async () => {
    await deleteItem(STORE_KEY);
    await deleteItem(ONBOARDED_KEY).catch(() => {});
    setOnboarded(false);
    setStored(null);
    setBalance(null);
  }, []);

  const value = useMemo<AccountState>(
    () => ({
      ready,
      hasWallet: !!stored,
      onboarded,
      finishOnboarding,
      accountId: stored?.accountId ?? null,
      secretKey: stored?.secretKey ?? null,
      publicKey: stored ? KeyPair.fromString(stored.secretKey as KeyPairString).getPublicKey().toString() : null,
      balance,
      refreshBalance,
      createAccount,
      importAccount,
      resetAccount,
      account: () => {
        if (!stored) throw new Error('Account not ready');
        return signer(stored.accountId, stored.secretKey);
      },
    }),
    [ready, stored, onboarded, balance, finishOnboarding, refreshBalance, createAccount, importAccount, resetAccount],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount outside AccountProvider');
  return v;
}
