import { Tabs, TabList, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, Icon, type IconName } from './kit';

/** Bottom tab bar from the ShowUp design: white, icon over label, purple when selected. Same on iOS, Android and web. */
export default function AppTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <View style={{ flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: 12 }}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="ticket">Events</TabButton>
          </TabTrigger>
          <TabTrigger name="cards" href="/cards" asChild>
            <TabButton icon="gift">Gift cards</TabButton>
          </TabTrigger>
          <TabTrigger name="me" href="/me" asChild>
            <TabButton icon="user">Me</TabButton>
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, icon, ...props }: TabTriggerSlotProps & { icon: IconName }) {
  const { ref: _ref, ...rest } = props as TabTriggerSlotProps & { ref?: unknown };
  void _ref;
  const fg = isFocused ? C.accent : C.muted;
  return (
    <Pressable
      {...(rest as object)}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      style={({ pressed }) => ({ flex: 1, minHeight: 56, paddingVertical: 4, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={22} color={fg} />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.25} style={{ color: fg, fontSize: 13, fontFamily: isFocused ? F.bodyBold : F.bodyMedium }}>{children}</Text>
    </Pressable>
  );
}
