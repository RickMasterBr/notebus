import { useEffect, useMemo } from "react";
import { PanResponder } from "react-native";
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { motion } from "../theme";
import { toastDismissDirection, toastExitOffset } from "./toastGesture";

export function useToastSwipe(
  toastId: number | undefined,
  dismiss: () => void,
  reduceMotion: boolean,
) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    tx.value = 0;
    ty.value = 0;
    opacity.value = 1;
  }, [toastId, tx, ty, opacity]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 || g.dy < -10,
        onPanResponderMove: (_, g) => {
          tx.value = g.dx;
          ty.value = Math.min(0, g.dy);
        },
        onPanResponderRelease: (_, g) => {
          const direction = toastDismissDirection(g);
          if (direction) {
            if (reduceMotion) {
              dismiss();
            } else {
              const offset = toastExitOffset(direction);
              tx.value = withTiming(offset.x, { duration: motion.fast });
              ty.value = withTiming(offset.y, { duration: motion.fast });
              opacity.value = withTiming(0, { duration: motion.fast }, (finished) => {
                if (finished) {
                  runOnJS(dismiss)();
                }
              });
            }
          } else {
            tx.value = withTiming(0, { duration: motion.fast });
            ty.value = withTiming(0, { duration: motion.fast });
            opacity.value = withTiming(1, { duration: motion.fast });
          }
        },
        onPanResponderTerminate: () => {
          tx.value = withTiming(0, { duration: motion.fast });
          ty.value = withTiming(0, { duration: motion.fast });
          opacity.value = withTiming(1, { duration: motion.fast });
        },
      }),
    [dismiss, reduceMotion, tx, ty, opacity],
  );

  return {
    panHandlers: panResponder.panHandlers,
    swipeStyle,
  };
}
