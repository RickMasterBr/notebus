/** Busca em pílula (4.4 §5.9). Fundo `fill` e lupa como no canvas da 4.5 (Main.dc.html); toque encolhe a 96% em 100 ms (4.5 §2.5). */
import type { Ref } from "react";
import { Pressable, StyleSheet, Text, type View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { SearchGlyph } from "./Glyphs";

/** `ref` aponta para o botão: ao fechar a Busca, o foco do VoiceOver volta para ele. */
export function SearchPill({ onPress, ref }: { onPress: () => void; ref?: Ref<View> }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animated}>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={t("home.search_placeholder")}
        onPress={onPress}
        onPressIn={() => (scale.value = withTiming(0.96, { duration: 100 }))}
        onPressOut={() => (scale.value = withTiming(1, { duration: 100 }))}
        style={[styles.pill, { backgroundColor: colors.fill }]}
      >
        <SearchGlyph color={colors.textSecondary} />
        <Text style={[type.body, styles.text, { color: colors.textSecondary }]}>{t("home.search_placeholder")}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Canvas: altura 44, padding lateral 14, intervalo 8. `minHeight` deixa a pílula crescer com o Dynamic Type.
  pill: {
    minHeight: minTouch,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  text: { flexShrink: 1 },
});
