import { useState } from 'react';
import { Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAccount } from '@/context/account';
import { Button, C, Card, H1, Notice, P, Screen } from '@/components/kit';

export default function Backup() {
  const { accountId, secretKey } = useAccount();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, v: string) => {
    await Clipboard.setStringAsync(v);
    setCopied(label);
  };

  return (
    <Screen padTop={false}>
      <H1>Back up & export</H1>
      <P>Your ShowUp wallet lives only on this phone. Save its private key to keep your money if you lose the phone, or to open the same wallet in HOT, Meteor or MyNearWallet (“Import account → private key”).</P>
      <Notice tone="red" text="Anyone with this key controls your money. Never share it, never paste it into a website you don't trust, and ShowUp will never ask for it." />
      <Card>
        <P muted small>Account</P>
        <Text selectable style={{ fontFamily: 'monospace', color: C.ink }}>{accountId}</Text>
        <Button variant="secondary" title={copied === 'account' ? 'Copied' : 'Copy account'} onPress={() => copy('account', accountId ?? '')} />
      </Card>
      {!shown ? (
        <Button title="I understand — show my private key" onPress={() => setShown(true)} />
      ) : (
        <Card tone="red">
          <P muted small>Private key</P>
          <Text selectable style={{ fontFamily: 'monospace', color: C.ink }}>{secretKey}</Text>
          <Button variant="secondary" title={copied === 'key' ? 'Copied — paste it somewhere safe' : 'Copy private key'} onPress={() => copy('key', secretKey ?? '')} />
          <Button variant="ghost" title="Hide" onPress={() => setShown(false)} />
        </Card>
      )}
    </Screen>
  );
}
