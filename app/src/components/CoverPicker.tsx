import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C, F, Icon, errorText } from './kit';
import { uploadImage } from '@/lib/profile';
import { coverUrl } from '@/lib/social';

/** Optional event cover photo. Uploads to NEAR Social's IPFS gateway as soon as it's picked (free). */
export function CoverPicker({ cid, onChange, onError }: { cid: string | null; onChange: (cid: string | null) => void; onError: (msg: string | null) => void }) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const shown = localUri ?? (cid ? coverUrl(cid) : null);

  async function pick() {
    onError(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.6 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setLocalUri(a.uri);
    setUploading(true);
    try {
      onChange(await uploadImage(a.uri, a.mimeType ?? 'image/jpeg'));
    } catch (e) {
      setLocalUri(null);
      onChange(null);
      onError(errorText(e));
    } finally {
      setUploading(false);
    }
  }

  if (!shown) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a cover photo"
        onPress={pick}
        style={({ pressed }) => ({ minHeight: 120, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.accent, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.8 : 1 })}>
        <Icon name="image" size={24} color={C.accent} />
        <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: C.purpleInk }}>Add a cover photo</Text>
        <Text style={{ fontFamily: F.body, fontSize: 13, color: C.muted }}>Optional · shows at the top of the event</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: C.field }}>
      <Image source={{ uri: shown }} style={{ width: '100%', aspectRatio: 16 / 9 }} accessibilityLabel="Event cover photo" />
      {uploading && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.accent} />
        </View>
      )}
      <View style={{ position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', gap: 8 }}>
        <Chip label="Change" onPress={pick} />
        <Chip label="Remove" onPress={() => { setLocalUri(null); onChange(null); }} />
      </View>
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} cover photo`} onPress={onPress} style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#FFFFFF', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: C.ink }}>{label}</Text>
    </Pressable>
  );
}
