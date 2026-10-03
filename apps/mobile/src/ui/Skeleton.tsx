/**
 * Esqueleto de carregamento (4.4 §5.17, D-127): blocos `fill` com a forma de linhas de lista.
 * Pulsa entre 100% e ~55% (ciclo ~1,2 s); estático com "Reduzir movimento". Um só elemento "ocupado" com o rótulo
 * `common.loading`; os blocos ficam fora da leitura. Saída: esmaece em `motion.fast`.
 */
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { t } from "../i18n";
import { useReduceMotion } from "../sheets/useReduceMotion";
import { minTouch, motion, radius, space, useTheme } from "../theme";

export function Skeleton({ rows = 4 }: { rows?: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(withSequence(withTiming(0.55, { duration: 600 }), withTiming(1, { duration: 600 })), -1);
    return () => cancelAnimation(opacity);
  }, [reduceMotion, opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      exiting={FadeOut.duration(motion.fast)}
      accessible
      accessibilityLabel={t("common.loading")}
      accessibilityState={{ busy: true }}
      style={pulse}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={styles.row}>
            <View style={[styles.title, { backgroundColor: colors.fill }]} />
            <View style={[styles.secondary, { backgroundColor: colors.fill }]} />
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Mesma altura da linha de lista (5.12): título largo + valor secundário curto.
  row: { minHeight: minTouch, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md },
  title: { flex: 1, height: 16, borderRadius: radius.sm },
  secondary: { width: 40, height: 12, borderRadius: radius.sm },
});
