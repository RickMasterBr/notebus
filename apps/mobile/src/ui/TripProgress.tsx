import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useReduceMotion } from "../sheets/useReduceMotion";
import { motion, radius, useTheme } from "../theme";

export interface TripProgressProps {
  fraction: number;
  accessibilityLabel?: string;
}

const PROGRESS_GAP = 4;

export function TripProgress({ fraction, accessibilityLabel }: TripProgressProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const [totalWidth, setTotalWidth] = useState(0);

  const clampedFraction = Math.min(1, Math.max(0, fraction));
  const progress = useSharedValue(clampedFraction);

  useEffect(() => {
    progress.value = withTiming(clampedFraction, {
      duration: reduceMotion ? 0 : motion.normal,
    });
  }, [clampedFraction, reduceMotion, progress]);

  const availableWidth = Math.max(0, totalWidth - PROGRESS_GAP);

  const leftAnimatedStyle = useAnimatedStyle(() => {
    const w = totalWidth > 0 ? progress.value * availableWidth : 0;
    return {
      width: w,
    };
  });

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clampedFraction * 100) }}
      onLayout={(e) => setTotalWidth(e.nativeEvent.layout.width)}
      style={styles.container}
    >
      <Animated.View
        style={[
          styles.segment,
          { backgroundColor: colors.accent },
          leftAnimatedStyle,
        ]}
      />
      <View
        style={[
          styles.segment,
          styles.rightSegment,
          { backgroundColor: colors.fill },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 6,
    width: "100%",
    flexDirection: "row",
    gap: PROGRESS_GAP,
    alignItems: "center",
  },
  segment: {
    height: 6,
    borderRadius: radius.full,
  },
  rightSegment: {
    flex: 1,
  },
});
