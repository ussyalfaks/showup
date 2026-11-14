import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C, Field, errorText } from './kit';
import { uploadImage } from '@/lib/profile';
import { imageUrl } from '@/lib/social';

/** Photo + name. The photo uploads to IPFS as soon as it's picked (free), so saving is one step. */
export function ProfileEditor({
  name,
  onName,
  imageCid,
  onImageCid,
  onError,
}: {
  name: string;
  onName: (v: string) => void;
  imageCid: string | null;
  onImageCid: (cid: string | null) => void;
  onError: (msg: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const shown = localUri ?? imageUrl(imageCid ? { ipfs_cid: imageCid } : undefined);
  const initial = (name.trim() || '?').slice(0, 1).toUpperCase();

  async function pick() {
    onError(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setLocalUri(a.uri);
    setUploading(true);
    try {
      onImageCid(await uploadImage(a.uri, a.mimeType ?? 'image/jpeg'));
    } catch (e) {
      setLocalUri(null);
      onError(errorText(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={{ gap: 18, alignItems: 'center' }}>
      <Pressable
        onPress={pick}
        accessibilityRole="button"
        accessibilityLabel={shown ? 'Change profile photo' : 'Add a profile photo'}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, alignItems: 'center', gap: 8 })}>
        <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: C.accentSoft, borderWidth: 3, borderColor: C.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {shown ? <Image source={{ uri: shown }} style={{ width: 112, height: 112 }} /> : <Text style={{ fontSize: 44, fontWeight: '800', color: C.accentInk }}>{initial}</Text>}
          {uploading && (
            <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={C.accent} />
            </View>
          )}
        </View>
        <Text style={{ color: C.accentInk, fontWeight: '700', fontSize: 15 }}>{shown ? 'Change photo' : 'Add a photo'}</Text>
      </Pressable>
      <View style={{ alignSelf: 'stretch' }}>
        <Field label="Your name" value={name} onChangeText={onName} placeholder="Ada Okafor" autoCapitalize="words" maxLength={60} hint="Hosts and friends see this instead of your wallet address." />
      </View>
    </View>
  );
}
