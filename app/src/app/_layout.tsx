import '@/lib/polyfills';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AccountProvider, useAccount } from '@/context/account';
import { C } from '@/components/kit';
import { AnimatedSplash } from '@/components/AnimatedSplash';

SplashScreen.preventAutoHideAsync();
// The native splash is plain black and the animated splash starts black: no fade needed.
SplashScreen.setOptions({ fade: false });

function Gate() {
  const { ready } = useAccount();
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  return (
    <>
      <StatusBar style={splashDone ? 'dark' : 'light'} />
      <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.paper },
        headerTintColor: C.ink,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: C.paper },
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
      <Stack.Screen name="event/new" options={{ title: 'New event', presentation: 'modal' }} />
      <Stack.Screen name="card/new" options={{ title: 'New gift card', presentation: 'modal' }} />
      <Stack.Screen name="claim" options={{ title: 'Claim a card' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan', presentation: 'modal' }} />
      <Stack.Screen name="send" options={{ title: 'Send' }} />
      <Stack.Screen name="backup" options={{ title: 'Back up wallet' }} />
      </Stack>
      <AnimatedSplash start={ready} onDone={() => setSplashDone(true)} />
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
