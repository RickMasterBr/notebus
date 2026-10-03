/** Ícones desenhados com Views (sem biblioteca de ícones). Só decoração: quem usa dá o rótulo de acessibilidade. */
import { StyleSheet, View } from "react-native";

const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" } as const;

/** Lupa de 18 px (canvas da 4.5, Main.dc.html). */
export function SearchGlyph({ color }: { color: string }) {
  return (
    <View style={styles.search} {...HIDDEN}>
      <View style={[styles.lens, { borderColor: color }]} />
      <View style={[styles.handle, { backgroundColor: color }]} />
    </View>
  );
}

/** ✕ de 14 px: duas barras cruzadas. */
export function CrossGlyph({ color }: { color: string }) {
  return (
    <View style={styles.cross} {...HIDDEN}>
      <View style={[styles.bar, { backgroundColor: color, transform: [{ rotate: "45deg" }] }]} />
      <View style={[styles.bar, { backgroundColor: color, transform: [{ rotate: "-45deg" }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { width: 18, height: 18 },
  lens: { position: "absolute", left: 1, top: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  handle: { position: "absolute", left: 11, top: 14, width: 7, height: 2, borderRadius: 1, transform: [{ rotate: "45deg" }] },
  cross: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  bar: { position: "absolute", width: 16, height: 2, borderRadius: 1 },
});
