import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAccount } from '@/context/account';
import { Button, C, F, IconButton, Notice, P, Screen, errorText } from '@/components/kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { call, parseAddress, parseCheckin } from '@/lib/near';
import { claimParams, parseCardLink } from '@/lib/cardcode';
import { shortId } from '@/lib/units';

/**
 * mode=checkin&event=<id>: host scans guests' ticket QRs and checks them in on-chain.
 * mode=claim: scan a gift card QR and open it.
 */
export default function Scan() {
  const { mode, event } = useLocalSearchParams<{ mode: 'checkin' | 'claim' | 'address'; event?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const { account } = useAccount();
  const busy = useRef(false);
  const insets = useSafeAreaInsets();
  const [log, setLog] = useState<{ text: string; tone: 'green' | 'red' }[]>([]);

  async function onScan(data: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      if (mode === 'address') {
        const to = parseAddress(data);
        if (to) router.dismissTo({ pathname: '/send', params: { to } });
        else setLog((l) => [{ text: 'That QR is not a NEAR address.', tone: 'red' as const }, ...l]);
        return;
      }
      if (mode === 'claim') {
        const card = parseCardLink(data);
        if (card) router.replace({ pathname: '/claim', params: claimParams(card) });
        else setLog((l) => [{ text: 'That QR is not a ShowUp gift card.', tone: 'red' as const }, ...l]);
        return;
      }
      const qr = parseCheckin(data);
      if (!qr) {
        setLog((l) => [{ text: 'Not a ShowUp ticket.', tone: 'red' as const }, ...l]);
        return;
      }
      if (qr.e !== event) {
        setLog((l) => [{ text: `${shortId(qr.g)}'s ticket is for another event.`, tone: 'red' as const }, ...l]);
        return;
      }
      await call(account(), 'check_in', { event_id: qr.e, guest: qr.g, ts_ms: String(qr.ts), signature: qr.s }, { tgas: 30 });
      setLog((l) => [{ text: `✓ ${shortId(qr.g)} checked in`, tone: 'green' as const }, ...l]);
    } catch (e) {
      setLog((l) => [{ text: errorText(e), tone: 'red' as const }, ...l]);
    } finally {
      // Small pause so the same QR isn't submitted twice in a row.
      setTimeout(() => (busy.current = false), 1500);
    }
  }

  if (!permission) return <Screen back="Scan"><P muted>Checking camera permission…</P></Screen>;
  if (!permission.granted) {
    return (
      <Screen back="Scan">
        <P>ShowUp needs the camera to scan {mode === 'claim' ? 'gift card' : mode === 'address' ? 'wallet' : 'ticket'} QR codes.</P>
        <Button title="Allow camera" onPress={requestPermission} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => onScan(data)} />
      <View style={{ position: 'absolute', top: insets.top + 12, left: 16 }}>
        <IconButton icon="x" label="Close scanner" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 8, backgroundColor: 'rgba(255,255,255,0.97)', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '45%' }}>
        <Text style={{ fontFamily: F.display, color: C.ink }}>{mode === 'claim' ? 'Point at a gift card QR' : mode === 'address' ? 'Point at their ShowUp “receive” QR' : 'Point at a guest’s ticket QR'}</Text>
        {log.slice(0, 5).map((l, i) => <Notice key={i} tone={l.tone} text={l.text} />)}
      </View>
    </View>
  );
}
