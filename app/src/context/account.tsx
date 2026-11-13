import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { deleteItem, getItem, setItem } from '@/lib/storage';
import { nearBalance, newImplicitAccount, signer } from '@/lib/near';

const STORE_KEY = 'showup.account.v1';

interface Stored {
  accountId: string;
  secretKey: string;
}

interface AccountState {
  ready: boolean;
  accountId: string | null;
  secretKey: string | null;
  publicKey: string | null;
  /** yoctoNEAR; null = account not on-chain yet (send it some NEAR or claim a card). */
  balance: bigint | null;
  refreshBalance: () => Promise<void>;
  importAccount: (accountId: string, secretKey: string) => Promise<void>;
  resetAccount: () => Promise<void>;
  account: () => ReturnType<typeof signer>;
}

const Ctx = createContext<AccountState | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(null);
  const [ready, setReady] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    (async () => {
      let s: Stored | null = null;
      const raw = await getItem(STORE_KEY);
      if (raw) s = JSON.parse(raw);
      if (!s) {
        // First launch: make a wallet on the phone. No sign-up, no seed phrase screen.
        s = newImplicitAccount();
        await setItem(STORE_KEY, JSON.stringify(s));
      }
      setStored(s);
      setReady(true);
    })();
  }, []);

  const refreshBalance = useCallback(async () => {
    if (stored) setBalance(await nearBalance(stored.accountId));
  }, [stored]);

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

  const resetAccount = useCallback(async () => {
    await deleteItem(STORE_KEY);
    const s = newImplicitAccount();
    await setItem(STORE_KEY, JSON.stringify(s));
    setStored(s);
  }, []);

  const value = useMemo<AccountState>(
    () => ({
      ready,
      accountId: stored?.accountId ?? null,
      secretKey: stored?.secretKey ?? null,
      publicKey: stored ? KeyPair.fromString(stored.secretKey as KeyPairString).getPublicKey().toString() : null,
      balance,
      refreshBalance,
      importAccount,
      resetAccount,
      account: () => {
        if (!stored) throw new Error('Account not ready');
        return signer(stored.accountId, stored.secretKey);
      },
    }),
    [ready, stored, balance, refreshBalance, importAccount, resetAccount],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount outside AccountProvider');
  return v;
}
