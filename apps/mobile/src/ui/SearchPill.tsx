/** Busca em pílula (4.4 §5.9). Fundo `fill` e lupa como no canvas da 4.5 (Main.dc.html); toque encolhe a 96% em 100 ms (4.5 §2.5). */
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";

/** Lupa de 18 px desenhada com Views (sem biblioteca de ícones). Só decoração: o rótulo é o texto da pílula. */
function SearchIcon({ color }: { color: string }) {
  return (
    <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.lens, { borderColor: color }]} />
      <View style={[styles.handle, { backgroundColor: color }]} />
    </View>
  );
}

export function SearchPill({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("home.search_placeholder")}
        onPress={onPress}
        onPressIn={() => (scale.value = withTiming(0.96, { duration: 100 }))}
        onPressOut={() => (scale.value = withTiming(1, { duration: 100 }))}
        style={[styles.pill, { backgroundColor: colors.fill }]}
      >
        <SearchIcon color={colors.textSecondary} />
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
  icon: { width: 18, height: 18 },
  lens: { position: "absolute", left: 1, top: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  handle: { position: "absolute", left: 11, top: 14, width: 7, height: 2, borderRadius: 1, transform: [{ rotate: "45deg" }] },
});
