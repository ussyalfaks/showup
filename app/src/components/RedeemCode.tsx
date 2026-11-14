import { useState } from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, C, F } from './kit';
import { formatCode } from '@/lib/cardcode';

/** The card's redeem code, big and easy to read out, with a copy button. */
export function RedeemCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const shown = formatCode(code);
  return (
    <View style={{ gap: 10, padding: 16, borderRadius: 22, borderWidth: 1.5, borderColor: C.accent, borderStyle: 'dashed', backgroundColor: C.accentSoft }}>
      <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 1.4, color: C.purpleInk }}>REDEEM CODE</Text>
      <Text selectable accessibilityLabel={`Redeem code ${shown.split('').join(' ')}`} style={{ fontSize: 30, letterSpacing: 3, color: C.ink, fontFamily: F.mono }}>
        {shown}
      </Text>
      <Text style={{ fontFamily: F.body, fontSize: 14, color: C.mutedInk, lineHeight: 20 }}>Send this separately from the link: say it, or send it in another message. The card can&apos;t be claimed without it.</Text>
      <Button variant="white" icon={copied ? 'check' : 'copy'} title={copied ? 'Code copied' : 'Copy code'} onPress={async () => { await Clipboard.setStringAsync(shown); setCopied(true); }} />
    </View>
  );
}
