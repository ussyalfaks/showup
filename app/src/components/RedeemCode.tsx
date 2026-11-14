import { useState } from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, C } from './kit';
import { formatCode } from '@/lib/cardcode';

/** The card's redeem code, big and easy to read out, with a copy button. */
export function RedeemCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const shown = formatCode(code);
  return (
    <View style={{ gap: 10, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: C.accent, borderStyle: 'dashed', backgroundColor: C.input }}>
      <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1.2, color: C.muted }}>REDEEM CODE</Text>
      <Text
        selectable
        accessibilityLabel={`Redeem code ${shown.split('').join(' ')}`}
        style={{ fontSize: 30, fontWeight: '800', letterSpacing: 3, color: C.accent, fontFamily: 'Menlo' }}>
        {shown}
      </Text>
      <Text style={{ fontSize: 14, color: C.muted, lineHeight: 20 }}>Send this separately from the link: say it, or send it in another message. The card can&apos;t be claimed without it.</Text>
      <Button variant="secondary" title={copied ? 'Code copied' : 'Copy code'} onPress={async () => { await Clipboard.setStringAsync(shown); setCopied(true); }} />
    </View>
  );
}
