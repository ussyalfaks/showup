import { NativeTabs } from 'expo-router/native-tabs';
import { C } from './kit';

// iOS: SF Symbols, filled when selected (tab-bars.md › Best practices). Android: the PNGs.
export default function AppTabs() {
  return (
    <NativeTabs backgroundColor={C.paper} indicatorColor={C.accentSoft} labelStyle={{ selected: { color: C.ink } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Events</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'ticket', selected: 'ticket.fill' }} src={require('@/assets/images/tabIcons/events.png')} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cards">
        <NativeTabs.Trigger.Label>Gift Cards</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gift', selected: 'gift.fill' }} src={require('@/assets/images/tabIcons/cards.png')} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="me">
        <NativeTabs.Trigger.Label>Me</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} src={require('@/assets/images/tabIcons/me.png')} renderingMode="template" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
