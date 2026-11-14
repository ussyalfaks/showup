import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { getProfiles, imageUrl, type Profile } from '@/lib/social';
import { shortId } from '@/lib/units';
import { C } from './kit';

/** Profiles for a list of accounts (cached; one SocialDB call per new batch). */
export function useProfiles(accounts: string[], refresh = 0) {
  const [profiles, setProfiles] = useState<Record<string, Profile | null>>({});
  const key = `${accounts.join(',')}#${refresh}`;
  useEffect(() => {
    let alive = true;
    if (accounts.length) getProfiles(accounts).then((p) => alive && setProfiles(p));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return profiles;
}

/** "Ada · @ada.near" with her NEAR Social photo, or a short address if there's no profile. */
export function Who({ account, profile, size = 28, suffix }: { account: string; profile?: Profile | null; size?: number; suffix?: string }) {
  const own = useProfiles(profile === undefined ? [account] : []);
  const p = profile === undefined ? own[account] : profile;
  const img = imageUrl(p?.image);
  const initial = (p?.name ?? account).slice(0, 1).toUpperCase();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {img ? (
        <Image source={{ uri: img }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.line }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.accentInk, fontWeight: '800', fontSize: size * 0.45 }}>{initial}</Text>
        </View>
      )}
      <Text style={{ color: C.ink, fontSize: 14, flexShrink: 1 }} numberOfLines={1}>
        {p?.name ? (
          <>
            <Text style={{ fontWeight: '700' }}>{p.name}</Text>
            <Text style={{ color: C.muted }}> · @{shortId(account)}</Text>
          </>
        ) : (
          <Text style={{ fontFamily: 'monospace', fontSize: 13 }}>{shortId(account)}</Text>
        )}
        {suffix ? <Text style={{ color: C.muted }}>{suffix}</Text> : null}
      </Text>
    </View>
  );
}
