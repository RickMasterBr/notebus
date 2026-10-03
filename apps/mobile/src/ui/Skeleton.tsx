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

export function Skeleton({ rows = 4, variant = "rows" }: { rows?: number; variant?: "rows" | "card" }) {
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
        {variant === "card" ? (
          // Forma do cartão de ponto (StopCardView): borda, nome, e duas linhas com selo, texto e horário à direita.
          <View style={[styles.card, { borderColor: colors.divider }]}>
            <View style={[styles.cardName, { backgroundColor: colors.fill }]} />
            {[0, 1].map((i) => (
              <View key={i} style={styles.cardLine}>
                <View style={[styles.badge, { backgroundColor: colors.fill }]} />
                <View style={styles.cardText}>
                  <View style={[styles.cardTitle, { backgroundColor: colors.fill }]} />
                  <View style={[styles.cardCaption, { backgroundColor: colors.fill }]} />
                </View>
                <View style={[styles.cardTime, { backgroundColor: colors.fill }]} />
              </View>
            ))}
          </View>
        ) : null}
        {variant === "rows" ? Array.from({ length: rows }, (_, i) => (
          <View key={i} style={styles.row}>
            <View style={[styles.title, { backgroundColor: colors.fill }]} />
            <View style={[styles.secondary, { backgroundColor: colors.fill }]} />
          </View>
        )) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Mesma altura da linha de lista (5.12): título largo + valor secundário curto.
  row: { minHeight: minTouch, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md },
  title: { flex: 1, height: 16, borderRadius: radius.sm },
  secondary: { width: 40, height: 12, borderRadius: radius.sm },
  // Mesma forma do cartão de ponto: borda `divider`, raio `md`, padding 12 × 14.
  card: { borderWidth: 1, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  cardName: { width: "55%", height: 17, borderRadius: radius.sm },
  cardLine: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { width: 36, height: 28, borderRadius: radius.sm },
  cardText: { flex: 1, gap: 6 },
  cardTitle: { width: "70%", height: 15, borderRadius: radius.sm },
  cardCaption: { width: "50%", height: 12, borderRadius: radius.sm },
  cardTime: { width: 56, height: 24, borderRadius: radius.sm },
});
