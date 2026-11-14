import '@/lib/polyfills';
import { Stack, router, useRootNavigationState, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AccountProvider, useAccount } from '@/context/account';
import { C } from '@/components/kit';
import { AnimatedSplash } from '@/components/AnimatedSplash';

SplashScreen.preventAutoHideAsync();
// The native splash is plain black and the animated splash starts black: no fade needed.
SplashScreen.setOptions({ fade: false });

function Gate() {
  const { ready, onboarded } = useAccount();
  const segments = useSegments();
  const navReady = !!useRootNavigationState()?.key;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  // Onboarding gate: new people start at /welcome. Gift card links (/claim) work before
  // onboarding, because the claim screen can create the wallet itself.
  useEffect(() => {
    if (!ready || !navReady) return;
    const at = segments[0];
    if (!onboarded && at !== 'welcome' && at !== 'claim') router.replace('/welcome');
    else if (onboarded && at === 'welcome') router.replace('/');
  }, [ready, navReady, onboarded, segments]);
  return (
    <>
      <StatusBar style="light" />
      <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.paper },
        headerTintColor: C.accentInk,
        headerTitleStyle: { color: C.ink },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: C.paper },
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* First launch: create or import a wallet. The gate above sends people here until done. */}
      <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
      <Stack.Screen name="event/new" options={{ title: 'New event', presentation: 'modal' }} />
      <Stack.Screen name="card/new" options={{ title: 'New gift card', presentation: 'modal' }} />
      {/* Gift card links work before onboarding: the claim screen can create the wallet. */}
      <Stack.Screen name="claim" options={{ title: 'Claim a card' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan', presentation: 'modal' }} />
      <Stack.Screen name="send" options={{ title: 'Send' }} />
      <Stack.Screen name="backup" options={{ title: 'Back up wallet' }} />
      <Stack.Screen name="profile" options={{ title: 'Edit profile', presentation: 'modal' }} />
      </Stack>
      <AnimatedSplash start={ready} onDone={() => {}} />
    </>
  );
}

export default function RootLayout() {
  return (
    <AccountProvider>
      <Gate />
    </AccountProvider>
  );
}
