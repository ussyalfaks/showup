import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, Text, View } from 'react-native';
import { C } from './kit';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <View style={{ position: 'absolute', bottom: 16, alignSelf: 'center', flexDirection: 'row', gap: 6, backgroundColor: C.card, padding: 6, borderRadius: 999, borderWidth: 1, borderColor: C.line }}>
          <TabTrigger name="index" href="/" asChild><TabButton>Events</TabButton></TabTrigger>
          <TabTrigger name="cards" href="/cards" asChild><TabButton>Gift Cards</TabButton></TabTrigger>
          <TabTrigger name="me" href="/me" asChild><TabButton>Me</TabButton></TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const { ref: _ref, ...rest } = props as TabTriggerSlotProps & { ref?: unknown };
  void _ref;
  return (
    <Pressable {...(rest as object)} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: isFocused ? C.accent : 'transparent' }}>
      <Text style={{ color: isFocused ? C.onAccent : C.ink, fontWeight: '600' }}>{children}</Text>
    </Pressable>
  );
}
