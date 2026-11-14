import '@/lib/polyfills';
import { Stack, router, useRootNavigationState, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { AccountProvider, useAccount } from '@/context/account';
import { C } from '@/components/kit';
import { AnimatedSplash } from '@/components/AnimatedSplash';

SplashScreen.preventAutoHideAsync();
// The native splash is plain black and the animated splash starts black: no fade needed.
SplashScreen.setOptions({ fade: false });

function Gate() {
  const { ready: accountReady, onboarded } = useAccount();
  // Fonts load with the splash, so text never flashes in the system face.
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  const ready = accountReady && (fontsLoaded || !!fontError);
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
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }}>
        <Stack.Screen name="(tabs)" />
        {/* First launch: create or import a wallet. The gate above sends people here until done. */}
        <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="event/[id]" />
        <Stack.Screen name="event/new" />
        <Stack.Screen name="card/new" />
        {/* Gift card links work before onboarding: the claim screen can create the wallet. */}
        <Stack.Screen name="claim" />
        <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
        <Stack.Screen name="send" />
        <Stack.Screen name="backup" />
        <Stack.Screen name="profile" />
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
