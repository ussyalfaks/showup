import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const C = {
  paper: '#FAF7F2',
  card: '#FFFFFF',
  ink: '#141414',
  muted: '#6E6A63', // 5.0:1 on paper, 4.5:1+ on every soft tint
  line: '#E6E0D6',
  mutedInk: '#55514B', // text on `line`: 6.0:1
  placeholder: '#77736B', // 4.7:1 on white
  accent: '#FF5A1F', // fills only (switch track, ticket band); never small text: 2.9:1 on paper
  accentInk: '#B23C0C', // accent-coloured text: 5.1:1 on accentSoft, 5.5:1 on paper
  accentSoft: '#FFE9DF',
  green: '#1B7F4B',
  greenInk: '#13663B', // small text on greenSoft: 6.2:1
  greenSoft: '#E3F4EA',
  red: '#B3392F',
  redSoft: '#FBE7E5',
};

export function Screen({ children, onRefresh, padTop = true }: { children: ReactNode; onRefresh?: () => Promise<unknown>; padTop?: boolean }) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.paper }}
      contentContainerStyle={{ padding: 18, paddingTop: padTop ? insets.top + 12 : 12, paddingBottom: insets.bottom + 96, gap: 14 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await onRefresh().catch(() => {});
              setRefreshing(false);
            }}
          />
        ) : undefined
      }>
      <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 14 }}>{children}</View>
    </ScrollView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}

export function P({ children, muted, small, mono }: { children: ReactNode; muted?: boolean; small?: boolean; mono?: boolean }) {
  return <Text style={[s.p, muted && { color: C.muted }, small && { fontSize: 14, lineHeight: 20 }, mono && { fontFamily: 'monospace' }]}>{children}</Text>;
}

export function Card({ children, tone }: { children: ReactNode; tone?: 'accent' | 'green' | 'red' }) {
  const bg = tone === 'accent' ? C.accentSoft : tone === 'green' ? C.greenSoft : tone === 'red' ? C.redSoft : C.card;
  return <View style={[s.card, { backgroundColor: bg }]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', disabled, busy }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; busy?: boolean }) {
  const bg = variant === 'primary' ? C.ink : variant === 'secondary' ? C.card : 'transparent';
  const fg = variant === 'primary' ? '#fff' : C.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, variant === 'secondary' && { borderWidth: 1, borderColor: C.line }]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={C.placeholder} style={s.input} autoCapitalize="none" autoCorrect={false} {...props} />
      {hint ? <Text style={{ color: C.muted, fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'accent' | 'green' | 'red' }) {
  const map = { muted: [C.line, C.mutedInk], accent: [C.accentSoft, C.accentInk], green: [C.greenSoft, C.greenInk], red: [C.redSoft, C.red] } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 13, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Row({ children, gap = 10 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap }}>{children}</View>;
}

export function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={[s.card, { flex: 1, minWidth: 90, padding: 12 }]}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{value}</Text>
      <Text style={{ fontSize: 12, color: C.muted }}>{label}</Text>
    </View>
  );
}

export function Notice({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'green' | 'red' | 'accent' }) {
  return (
    <Card tone={tone === 'muted' ? undefined : tone}>
      <Text style={{ color: tone === 'red' ? C.red : tone === 'green' ? C.green : C.ink, fontSize: 14 }}>{text}</Text>
    </Card>
  );
}

/** One choice from a short set (iOS segmented control look). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: C.line, borderRadius: 12, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => ({ flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.card : 'transparent', opacity: pressed && !on ? 0.6 : 1, ...(on ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : null) })}>
            <Text style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? C.ink : C.mutedInk }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Quick picks that fill a field, so people choose instead of type. */
export function Chips<T extends string | number>({ options, value, onPick, label }: { options: { value: T; label: string }[]; value?: T; onPick: (v: T) => void; label?: string }) {
  return (
    <View accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = value !== undefined && o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(o.value)}
            hitSlop={4}
            style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: on ? C.ink : C.line, backgroundColor: on ? C.ink : C.card, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: on ? '#fff' : C.ink }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A text link with a 44 pt tall hit region. */
export function Link({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: C.accentInk }}>{title}</Text>
    </Pressable>
  );
}

/**
 * Ask before an uncommon action that can't be undone. Resolves true only when the person confirms.
 * Native: system alert with Cancel. Web: the browser's confirm dialog (Alert.alert is a no-op there).
 */
export function confirmDestructive(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

export function errorText(e: unknown) {
  const m = (e as { message?: string })?.message ?? String(e);
  // A new wallet's key isn't on-chain until the wallet first receives NEAR.
  if (/Access key .* does not exist|account .* does not exist|AccountDoesNotExist/i.test(m))
    return "Your wallet isn't activated yet. Add some NEAR first: Me → Testnet faucet, or claim a gift card.";
  if (/Not enough allowance|does not have enough allowance/i.test(m)) return "This card can't pay for its own claim any more. Ask the sender to take it back (Gift Cards → Take back) and send a new one.";
  if (/NotEnoughBalance|LackBalanceForState|not enough balance/i.test(m)) return "Not enough NEAR in your wallet for this, including the network fee.";
  const kind = m.match(/Smart contract panicked: ([^"\n]+)/);
  return kind ? kind[1] : m.length > 240 ? m.slice(0, 240) + '…' : m;
}

/** Load once, reload on demand, and optionally poll. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[], pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
    if (!pollMs) return;
    const t = setInterval(run, pollMs);
    return () => clearInterval(t);
  }, [run, pollMs]);
  return { data, error, reload: run };
}

const s = StyleSheet.create({
  h1: { fontSize: 30, fontWeight: '800', color: C.ink, letterSpacing: -0.6 },
  h2: { fontSize: 13, fontWeight: '700', color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8 },
  p: { fontSize: 17, color: C.ink, lineHeight: 24 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.line, gap: 8 },
  btn: { minHeight: 50, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: C.ink },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.ink },
});
