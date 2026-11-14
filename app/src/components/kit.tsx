import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import QRCode from 'react-native-qrcode-svg';

// ShowUp design: light lavender paper, white surfaces, the logo's purple, coral accents and
// navy ink. Bricolage Grotesque for display, DM Sans for text, JetBrains Mono for numbers and
// addresses. Contrast measured (WCAG) against the surface each colour sits on.
export const C = {
  paper: '#F2F1F7', // app background
  card: '#FFFFFF', // surfaces
  raised: '#F2F1F7', // tiles inside white cards
  input: '#FFFFFF', // text fields
  field: '#ECEBF2', // filled fields and gray buttons
  line: '#E4E2EC', // borders
  ink: '#15132B', // text: 16:1 on paper
  navy: '#15132B', // dark buttons and the balance card
  muted: '#5F5C74', // secondary text: 5.7:1 on paper, 6.4:1 on white
  mutedInk: '#3D3A55',
  placeholder: '#77748C', // 4.5:1 on white
  accent: '#5218FB', // the logo's purple: brand, selection, links (7.3:1 on white)
  onAccent: '#FFFFFF', // text on purple: 7.3:1
  onAccentSoft: '#E2DAFF', // secondary text on purple: 5.5:1
  accentInk: '#5218FB',
  accentSoft: '#ECE6FF',
  purpleInk: '#4A12E0', // text on accentSoft: 7.1:1
  coral: '#FF7A55', // accents and coral buttons (navy text on it: 7.0:1; never white text)
  coralSoft: '#FFE4DA',
  green: '#1F8A4C',
  greenInk: '#17703F',
  greenSoft: '#E1F4E8',
  amber: '#8A5A00',
  amberSoft: '#FFF1D6',
  amberLine: '#F2D9A6',
  red: '#B23A22', // 6.0:1 on white, 4.9:1 on redSoft
  redSoft: '#FDE3DC',
  redLine: '#F6C3B5',
};

export const F = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayMedium: 'BricolageGrotesque_700Bold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
  mono: 'JetBrainsMono_500Medium',
  monoRegular: 'JetBrainsMono_400Regular',
};

export type IconName = ComponentProps<typeof Feather>['name'] | 'ticket';
/** Feather line icons; "ticket" comes from Ionicons (Feather has none). */
export function Icon({ name, size = 18, color = C.ink }: { name: IconName; size?: number; color?: string }) {
  if (name === 'ticket') return <Ionicons name="ticket-outline" size={size} color={color} />;
  return <Feather name={name} size={size} color={color} />;
}

/** Scrolling page. `back` draws the design's header: a square back button and a small title. */
export function Screen({ children, onRefresh, back, padTop = true, tabBar }: { children: ReactNode; onRefresh?: () => Promise<unknown>; back?: string; padTop?: boolean; tabBar?: boolean }) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.paper }}
      contentContainerStyle={{ padding: 20, paddingTop: padTop ? insets.top + 14 : 14, paddingBottom: insets.bottom + (tabBar ? 120 : 32), gap: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            tintColor={C.ink}
            colors={[C.onAccent]}
            progressBackgroundColor={C.accent}
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await onRefresh().catch(() => {});
              setRefreshing(false);
            }}
          />
        ) : undefined
      }>
      <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 16 }}>
        {back !== undefined && <TopBar title={back} />}
        {children}
      </View>
    </ScrollView>
  );
}

export function TopBar({ title, icon = 'arrow-left', light }: { title: string; icon?: IconName; light?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <IconButton round icon={icon} label={icon === 'x' ? 'Close' : 'Back'} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <Text style={{ color: light ? '#FFFFFF' : C.ink, fontFamily: F.bodyBold, fontSize: 15 }} accessibilityRole="header">{title}</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

/** The ShowUp logo (black "Show", purple "Up"). */
export function Logo({ height = 26 }: { height?: number }) {
  return <Image source={require('@/assets/images/brand/showup-logo-color.png')} style={{ height, width: height * (760 / 165) }} resizeMode="contain" accessibilityRole="header" accessibilityLabel="ShowUp" />;
}

/** "ShowUp" in the display face, "Up" in lime. */
export function Wordmark({ size = 26, upColor = C.accent, color = C.ink }: { size?: number; upColor?: string; color?: string }) {
  return (
    <Text accessibilityRole="header" accessibilityLabel="ShowUp" style={{ fontFamily: F.display, fontSize: size, color, letterSpacing: -0.5 }}>
      Show<Text style={{ color: upColor }}>Up</Text>
    </Text>
  );
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<any> }) {
  return <Text style={[s.h1, style]} accessibilityRole="header">{children}</Text>;
}

/** Section heading: "Events", "Cards you sent", "Do I show up?" */
export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
      <Text style={s.h2} accessibilityRole="header">{children}</Text>
      {right}
    </View>
  );
}

/** "01 · THE BASICS" */
export function SectionLabel({ n, children }: { n?: string; children: string }) {
  return <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 1.4, color: C.purpleInk }}>{n ? `${n} · ` : ''}{children.toUpperCase()}</Text>;
}

export function P({ children, muted, small, mono, style }: { children: ReactNode; muted?: boolean; small?: boolean; mono?: boolean; style?: StyleProp<any> }) {
  return <Text style={[s.p, muted && { color: C.muted }, small && { fontSize: 14, lineHeight: 20 }, mono && { fontFamily: F.monoRegular, fontSize: 13 }, style]}>{children}</Text>;
}

type Tone = 'accent' | 'green' | 'red' | 'amber' | 'lime';
export function Card({ children, tone, style, dashed }: { children: ReactNode; tone?: Tone; style?: StyleProp<ViewStyle>; dashed?: boolean }) {
  const bg = tone === 'lime' ? C.accent : tone === 'accent' ? C.accentSoft : tone === 'green' ? C.greenSoft : tone === 'red' ? C.redSoft : tone === 'amber' ? C.amberSoft : C.card;
  const border = tone === 'lime' ? C.accent : tone === 'accent' ? C.accentSoft : tone === 'green' ? C.greenSoft : tone === 'red' ? C.redLine : tone === 'amber' ? C.amberLine : C.line;
  return <View style={[s.card, { backgroundColor: bg, borderColor: border }, dashed && { borderStyle: 'dashed', backgroundColor: 'transparent' }, style]}>{children}</View>;
}

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'caution' | 'danger' | 'brand' | 'coral' | 'white';
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  icon,
  compact,
  style,
  accessibilityLabel,
}: {
  title: string;
  /** Spoken label when the visible title is shorter than the action (e.g. "Host"). */
  accessibilityLabel?: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const look: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: C.navy, fg: '#FFFFFF' },
    secondary: { bg: C.field, fg: C.ink },
    white: { bg: C.card, fg: C.ink, border: C.line },
    brand: { bg: C.accent, fg: C.onAccent },
    coral: { bg: C.coral, fg: C.navy },
    outline: { bg: 'transparent', fg: C.accent, border: C.accent },
    ghost: { bg: 'transparent', fg: C.accent },
    caution: { bg: C.card, fg: C.red, border: C.redLine },
    danger: { bg: 'transparent', fg: C.red, border: C.redLine },
  };
  const { bg, fg, border } = look[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        s.btn,
        compact && { minHeight: 44, paddingVertical: 10, paddingHorizontal: 10 },
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        border ? { borderWidth: 1, borderColor: border } : null,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon && <Icon name={icon} size={compact ? 16 : 18} color={fg} />}
          <Text numberOfLines={1} style={[s.btnText, { color: fg }, compact && { fontSize: 14 }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Square icon button (back, copy, scan). */
export function IconButton({ icon, label, onPress, size = 44, tone = 'card', round }: { icon: IconName; label: string; onPress: () => void; size?: number; tone?: 'card' | 'raised' | 'soft'; round?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: round ? size / 2 : 14, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'soft' ? C.accentSoft : tone === 'raised' ? C.field : C.card, borderWidth: tone === 'card' ? 1 : 0, borderColor: C.line, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={18} color={tone === 'soft' ? C.accent : C.ink} />
    </Pressable>
  );
}

export function Field({ label, hint, suffix, icon, mono, filled, ...props }: TextInputProps & { label?: string; hint?: string; suffix?: string; icon?: IconName; mono?: boolean; filled?: boolean }) {
  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={[s.inputWrap, filled && { backgroundColor: C.field, borderColor: C.field }]}>
        {icon && <Icon name={icon} size={16} color={C.muted} />}
        <TextInput
          placeholderTextColor={C.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
          style={[s.input, mono && { fontFamily: F.monoRegular, fontSize: 15 }, props.style]}
        />
        {suffix ? <Text style={{ color: C.muted, fontFamily: F.mono, fontSize: 13 }}>{suffix}</Text> : null}
      </View>
      {hint ? <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18 }}>{hint}</Text> : null}
    </View>
  );
}

export type PillTone = 'muted' | 'accent' | 'green' | 'red' | 'amber' | 'purple';
export function Pill({ text, tone = 'muted' }: { text: string; tone?: PillTone }) {
  const map = { muted: [C.field, C.mutedInk], accent: [C.accent, C.onAccent], purple: [C.accentSoft, C.purpleInk], green: [C.greenSoft, C.greenInk], red: [C.redSoft, C.red], amber: [C.amberSoft, C.amber] } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 13, fontFamily: F.bodyBold }}>{text}</Text>
    </View>
  );
}

export function Row({ children, gap = 10, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap }, style]}>{children}</View>;
}

export function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={[s.card, { flex: 1, minWidth: 80, padding: 14, gap: 4 }]}>
      <Text style={{ fontFamily: F.display, fontSize: 26, color: C.ink }}>{value}</Text>
      <Text style={{ fontSize: 14, color: C.muted, fontFamily: F.body }}>{label}</Text>
    </View>
  );
}

/** Inline message. Cautions get an icon, as in the design's "Anyone with this link…" box. */
export function Notice({ text, tone = 'muted', icon }: { text: string; tone?: 'muted' | 'green' | 'red' | 'accent' | 'amber'; icon?: IconName }) {
  const fg = tone === 'red' ? C.red : tone === 'green' ? C.greenInk : tone === 'accent' ? C.purpleInk : tone === 'amber' ? C.amber : C.ink;
  const i = icon ?? (tone === 'amber' ? 'alert-triangle' : tone === 'red' ? 'alert-circle' : undefined);
  return (
    <Card tone={tone === 'muted' ? undefined : tone} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      {i && <View style={{ paddingTop: 2 }}><Icon name={i} size={16} color={fg} /></View>}
      <Text style={{ color: fg, fontSize: 14, lineHeight: 20, flex: 1, fontFamily: F.body }}>{text}</Text>
    </Card>
  );
}

/** A tappable row in a grouped list (Wallet section). */
export function ListRow({ icon, title, onPress, tone = 'ink', right }: { icon: IconName; title: string; onPress: () => void; tone?: 'ink' | 'red'; right?: ReactNode }) {
  const fg = tone === 'red' ? C.red : C.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 16, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={18} color={tone === 'red' ? C.red : C.accent} />
      <Text style={{ flex: 1, fontSize: 16, fontFamily: F.bodyBold, color: fg }}>{title}</Text>
      {right}
    </Pressable>
  );
}

/** A QR code on white with a quiet zone, so it scans on the dark theme. */
export function QR({ value, size, label }: { value: string; size: number; label: string }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ alignSelf: 'center', padding: 14, backgroundColor: '#FFFFFF', borderRadius: 18 }}>
      <QRCode value={value} size={size} />
    </View>
  );
}

/**
 * One choice from a short set. Default: white bar, navy selection (check-in window).
 * `soft`: gray bar, white selection with purple text (NEAR / USDC).
 */
export function Segmented<T extends string>({ value, options, onChange, label, soft, light }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string; soft?: boolean; light?: boolean }) {
  const isSoft = soft || light;
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: isSoft ? C.field : C.card, borderRadius: 999, padding: 4, borderWidth: isSoft ? 0 : 1, borderColor: C.line }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => ({ flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? (isSoft ? C.card : C.navy) : 'transparent', opacity: pressed && !on ? 0.6 : 1 })}>
            <Text style={{ fontSize: 15, fontFamily: on ? F.bodyBold : F.bodyMedium, color: on ? (isSoft ? C.accent : '#FFFFFF') : C.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Quick picks that fill a field, so people choose instead of type. `columns` lays them out as a grid. */
export function Chips<T extends string | number>({ options, value, onPick, label, columns }: { options: { value: T; label: string }[]; value?: T; onPick: (v: T) => void; label?: string; columns?: number }) {
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
            style={({ pressed }) => ({
              minHeight: 46,
              paddingHorizontal: 16,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              flexGrow: columns ? 1 : 0,
              flexBasis: columns ? `${Math.floor(100 / columns) - 3}%` : undefined,
              borderWidth: 1,
              borderColor: on ? C.accent : C.line,
              backgroundColor: on ? C.accent : C.card,
              opacity: pressed ? 0.7 : 1,
            })}>
            <Text style={{ fontSize: 15, fontFamily: F.bodyBold, color: on ? C.onAccent : C.ink }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Ticket shape from the design: a stub, a dashed divider with notches cut top and bottom, a body.
 * `notch` is the colour behind the card, so the notches read as cut-outs.
 */
export function Ticket({ stub, children, bg = C.card, notch = C.paper, border = C.line, stubWidth = 84, stubRight, borderless, style }: { stub: ReactNode; children: ReactNode; bg?: string; notch?: string; border?: string; stubWidth?: number; stubRight?: boolean; borderless?: boolean; style?: StyleProp<ViewStyle> }) {
  const edge = borderless ? 0 : 1;
  const stubView = <View style={{ width: stubWidth, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}>{stub}</View>;
  const divider = (
    <View style={{ width: 1, alignSelf: 'stretch', alignItems: 'center' }}>
      <View style={{ position: 'absolute', top: -10, width: 18, height: 18, borderRadius: 9, backgroundColor: notch, borderWidth: edge, borderColor: border }} />
      <View style={{ flex: 1, marginVertical: 12, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: bg === C.card ? C.line : 'rgba(255,255,255,0.45)' }} />
      <View style={{ position: 'absolute', bottom: -10, width: 18, height: 18, borderRadius: 9, backgroundColor: notch, borderWidth: edge, borderColor: border }} />
    </View>
  );
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: bg, borderRadius: 22, borderWidth: edge, borderColor: border, overflow: 'hidden' }, style]}>
      {!stubRight && stubView}
      {!stubRight && divider}
      <View style={{ flex: 1, padding: 16, gap: 6 }}>{children}</View>
      {stubRight && divider}
      {stubRight && stubView}
    </View>
  );
}

/** A text link with a 44 pt tall hit region. */
export function Link({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ fontSize: 15, fontFamily: F.bodyBold, color: C.accentInk }}>{title}</Text>
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
    return "Your wallet isn't activated yet. Add some NEAR first: Me → Faucet, or claim a gift card.";
  if (/Not enough allowance|does not have enough allowance/i.test(m)) return "This card can't pay for its own claim any more. Ask the sender to take it back (Gift cards → Take back) and send a new one.";
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
  h1: { fontFamily: F.display, fontSize: 32, lineHeight: 36, color: C.ink, letterSpacing: -0.8 },
  h2: { fontFamily: F.display, fontSize: 22, color: C.ink, letterSpacing: -0.4 },
  p: { fontFamily: F.body, fontSize: 16, color: C.ink, lineHeight: 23 },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: C.line, gap: 10 },
  btn: { minHeight: 54, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.bodyBold, fontSize: 16 },
  label: { fontFamily: F.bodyBold, fontSize: 15, color: C.ink },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.input, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingHorizontal: 16, minHeight: 54 },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: C.ink, fontFamily: F.body },
});
