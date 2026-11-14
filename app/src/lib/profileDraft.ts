// A profile set up before the wallet has NEAR is kept on the phone and published later.
import type { ProfileInput } from './profile';
import { deleteItem, getItem, setItem } from './storage';

const DRAFT_KEY = 'showup.profileDraft.v1';
export async function loadDraft(): Promise<ProfileInput | null> {
  const raw = await getItem(DRAFT_KEY).catch(() => null);
  return raw ? (JSON.parse(raw) as ProfileInput) : null;
}
export const saveDraft = (p: ProfileInput) => setItem(DRAFT_KEY, JSON.stringify(p));
export const clearDraft = () => deleteItem(DRAFT_KEY).catch(() => {});

