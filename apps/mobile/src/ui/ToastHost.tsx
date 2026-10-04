/**
 * Toast na tela (4.5 §2.1 D-039, §2.5 D-043; canvas `Main.dc.html`/`Componentes.dc.html`): superfície invertida, raio 14,
 * borda de 1 px, título 15/600, corpo 13, ação 15/600 com alvo de 44 px. Sobe 16 px e aparece em 150 ms; com "Reduzir
 * movimento", só esmaece. Fica acima das folhas, sem entrar no layout delas, e só o próprio toast recebe toque
 * (`pointerEvents="box-none"` no invólucro): o resto da tela continua tocável.
 */
import { useMemo } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "../data/ToastProvider";
import { elevation, motion, radius, type, useTheme } from "../theme";
import { toastBottom } from "../data/toastPosition";
import { useKeyboardHeight } from "../sheets/useKeyboardHeight";
import { useReduceMotion } from "../sheets/useReduceMotion";

const RISE = 16;

/** Entrada do canvas: sobe 16 px e aparece, 150 ms. */
function riseIn() {
  "worklet";
  const timing = { duration: motion.fast, easing: Easing.out(Easing.ease) };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: RISE }] },
    animations: { opacity: withTiming(1, timing), transform: [{ translateY: withTiming(0, timing) }] },
  };
}

/** Saída do canvas: desce 16 px e esmaece, 150 ms (D-043; E-03 F7). */
function fallOut() {
  "worklet";
  const timing = { duration: motion.fast, easing: Easing.in(Easing.ease) };
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: { opacity: withTiming(0, timing), transform: [{ translateY: withTiming(RISE, timing) }] },
  };
}

export function ToastHost() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const reduceMotion = useReduceMotion();
  const { toast, press, dismiss } = useToast();

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 || g.dy > 10,
        onPanResponderRelease: (_, g) => {
          if (g.dy > 20 || Math.abs(g.dx) > 40) {
            dismiss();
          }
        },
      }),
    [dismiss],
  );

  return (
    // Canvas: 12 px dos lados e 28 px de baixo (a área segura do iPhone com a barra de início é de 34 pt); acima do teclado quando aberto.
    <View pointerEvents="box-none" style={[styles.host, { bottom: toastBottom(keyboardHeight, insets.bottom) }]}>
      {toast ? (
        <Animated.View
          // `key`: um toast novo, mesmo com o mesmo texto, roda a entrada de novo.
          key={toast.id}
          entering={reduceMotion ? FadeIn.duration(motion.fast) : riseIn}
          exiting={reduceMotion ? FadeOut.duration(motion.fast) : fallOut}
          accessibilityLiveRegion="polite"
          {...panResponder.panHandlers}
          style={[styles.toast, elevation.toast, { backgroundColor: colors.toast, borderColor: colors.toastBorder }]}
        >
          <View accessible accessibilityRole="text" style={styles.text}>
            <Text style={[type.subtitle, { color: colors.toastText }]}>{toast.title}</Text>
            {toast.body ? <Text style={[type.caption, styles.num, { color: colors.toastText }]}>{toast.body}</Text> : null}
          </View>
          {toast.action ? (
            <Pressable
              accessibilityRole="button"
              onPress={press}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
            >
              <Text style={[type.subtitle, { color: colors.toastAction }]}>{toast.action.label}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 12, right: 12 },
  // Canvas: padding 10 8 10 16, raio 14, 4 px entre o texto e a ação.
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 8,
  },
  text: { flex: 1, gap: 2 },
  action: { minHeight: 44, paddingHorizontal: 10, justifyContent: "center" },
  num: { fontVariant: ["tabular-nums"] },
});
