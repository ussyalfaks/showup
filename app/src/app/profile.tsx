import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useAccount } from '@/context/account';
import { Button, Notice, P, Screen, errorText } from '@/components/kit';
import { ProfileEditor } from '@/components/ProfileEditor';
import { saveProfile } from '@/lib/profile';
import { clearDraft, loadDraft, saveDraft } from '@/lib/profileDraft';
import { getProfiles } from '@/lib/social';

/** Edit name and photo in the app. Publishes to NEAR Social; no need to visit near.social. */
export default function EditProfile() {
  const { account, accountId, balance } = useAccount();
  const [name, setName] = useState('');
  const [imageCid, setImageCid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const funded = balance !== null;

  useEffect(() => {
    if (!accountId) return;
    (async () => {
      const draft = await loadDraft();
      if (draft) {
        setName(draft.name);
        setImageCid(draft.imageCid ?? null);
        return;
      }
      const p = (await getProfiles([accountId]))[accountId];
      if (p?.name) setName(p.name);
      if (p?.image?.ipfs_cid) setImageCid(p.image.ipfs_cid);
    })();
  }, [accountId]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (funded) await saveProfile(account(), accountId!, { name, imageCid }).then(clearDraft);
      else await saveDraft({ name: name.trim(), imageCid });
      router.back();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padTop={false}>
      <ProfileEditor name={name} onName={setName} imageCid={imageCid} onImageCid={setImageCid} onError={setError} />
      <Button title={funded ? 'Save profile' : 'Save on this phone'} onPress={save} busy={busy} disabled={!name.trim()} />
      <P small muted>
        {funded
          ? 'Saved to your public NEAR Social profile, so it shows in other NEAR apps too. Storage costs about 0.01 NEAR; the rest of the 0.05 NEAR deposit is refunded.'
          : "Your wallet has no NEAR yet. We'll keep this on your phone and you can publish it from Me once it's funded."}
      </P>
      {error && <Notice tone="red" text={error} />}
    </Screen>
  );
}
