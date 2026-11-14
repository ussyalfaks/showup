import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/** Brand splash colours (see the ShowUp splash brief). */
export const SPLASH_BG = '#024927';
const GLOW = '#39E75B';

// Logo asset proportions: "Show" and "Up" are cut from the supplied wordmark at the gap
// between them, so placed side by side they reproduce it exactly.
const SHOW_W = 558;
const UP_W = 285;
const LOGO_H = 185;
const LOGO_W = SHOW_W + UP_W;

const ease = Easing.out(Easing.cubic);

// Shown once per cold start, never again while the app is running.
let played = false;

/**
 * Black → deep green (300 ms), wordmark fades in and scales 96% → 100% (500 ms), the lime
 * "Up" draws on left to right (400 ms), hold (400 ms), then the splash fades away (300 ms).
 * Reduced motion: no scale or draw-on, just the logo on green and a short dissolve.
 * It sits over the app, which loads underneath, so it never delays startup work.
 */
export function AnimatedSplash({ start, onDone }: { start: boolean; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const [visible, setVisible] = useState(!played);
  const bg = useRef(new Animated.Value(0)).current; // black -> green
  const logo = useRef(new Animated.Value(0)).current; // opacity + scale
  const draw = useRef(new Animated.Value(0)).current; // "Up" reveal 0..1
  const exit = useRef(new Animated.Value(1)).current; // whole overlay opacity

  const logoW = Math.min(width * 0.62, 300);
  const scale = logoW / LOGO_W;
  const showW = SHOW_W * scale;
  const upW = UP_W * scale;
  const logoH = LOGO_H * scale;
  const glow = Math.max(width, height) * 0.9;

  useEffect(() => {
    if (played && !visible) {
      onDone();
      return;
    }
    if (!start) return; // stay black (matching the native splash) until the app is ready
    played = true;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        const finish = () => {
          setVisible(false);
          onDone();
        };
        if (reduce) {
          bg.setValue(1);
          logo.setValue(1);
          draw.setValue(1);
          Animated.sequence([Animated.delay(600), Animated.timing(exit, { toValue: 0, duration: 250, useNativeDriver: true })]).start(finish);
          return;
        }
        Animated.sequence([
          Animated.timing(bg, { toValue: 1, duration: 300, easing: ease, useNativeDriver: true }),
          Animated.timing(logo, { toValue: 1, duration: 500, easing: ease, useNativeDriver: true }),
          // width can't use the native driver; 400 ms of JS-driven layout is cheap here.
          Animated.timing(draw, { toValue: 1, duration: 400, easing: ease, useNativeDriver: false }),
          Animated.delay(400),
          Animated.timing(exit, { toValue: 0, duration: 300, easing: ease, useNativeDriver: true }),
        ]).start(finish);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  if (!visible) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel="ShowUp"
      style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: exit, zIndex: 100 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_BG, opacity: bg, alignItems: 'center', justifyContent: 'center' }]}>
        <Svg width={glow} height={glow} style={{ position: 'absolute' }}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={GLOW} stopOpacity={0.14} />
              <Stop offset="1" stopColor={GLOW} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={glow} height={glow} fill="url(#glow)" />
        </Svg>
        <Animated.View
          style={{
            flexDirection: 'row',
            opacity: logo,
            transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
          }}>
          <Animated.Image source={require('@/assets/images/brand/logo-show.png')} style={{ width: showW, height: logoH }} resizeMode="contain" />
          {/* "Up" draws on: a left-to-right reveal of the lime U and its check stroke. */}
          <Animated.View style={{ width: draw.interpolate({ inputRange: [0, 1], outputRange: [0, upW] }), height: logoH, overflow: 'hidden' }}>
            <Animated.Image source={require('@/assets/images/brand/logo-up.png')} style={{ width: upW, height: logoH }} resizeMode="contain" />
          </Animated.View>
          {/* Keeps the wordmark centred while "Up" is still drawing. */}
          <Animated.View style={{ width: draw.interpolate({ inputRange: [0, 1], outputRange: [upW, 0] }) }} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}
