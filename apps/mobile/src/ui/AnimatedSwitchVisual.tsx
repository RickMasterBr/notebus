import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DIAG_SCROLL } from "../sheets/diagScroll";
import { useReduceMotion } from "../sheets/useReduceMotion";
import { useTheme } from "../theme";
import { markSwitchEffect } from "./switchDiag";

export const SWITCH_ANIM_MS = 180;
export const SWITCH_THUMB_TRAVEL = 20;

/** Trilha e bolinha do interruptor do registro (FN-6): desliza e muda de cor; sem movimento se "Reduzir movimento". */
export function AnimatedSwitchVisual({ on, offColor, diagLabel }: { on: boolean; offColor?: string; diagLabel?: string }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    const diag = DIAG_SCROLL && diagLabel ? diagLabel : null;
    if (diag) markSwitchEffect(diag);
    progress.value = withTiming(on ? 1 : 0, { duration: reduceMotion ? 0 : SWITCH_ANIM_MS });
  }, [on, reduceMotion, progress, diagLabel]);
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offColor ?? colors.divider, colors.accent]),
  }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * SWITCH_THUMB_TRAVEL }],
  }));
  return (
    <Animated.View style={[styles.track, track]}>
      <Animated.View style={[styles.thumb, { backgroundColor: colors.surface }, thumb]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: { width: 51, height: 31, borderRadius: 16, padding: 2, justifyContent: "center" },
  thumb: { width: 27, height: 27, borderRadius: 14 },
});
