/** Ícones desenhados com Views (sem biblioteca de ícones). Só decoração: quem usa dá o rótulo de acessibilidade. */
import { StyleSheet, Text, View } from "react-native";

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

/** Engrenagem: a 4.4 não tem glifo de engrenagem; símbolo de texto simples (D-151), sem biblioteca de ícones. */
export function GearGlyph({ color }: { color: string }) {
  return (
    <Text style={[styles.gear, { color }]} {...HIDDEN}>
      {"\u2699\uFE0E"}
    </Text>
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

/** "+" de 22 px (canvas da 4.5: botão Registrar, traço de 2,4 px, pontas redondas). */
export function PlusGlyph({ color }: { color: string }) {
  return (
    <View style={styles.plus} {...HIDDEN}>
      <View style={[styles.plusBar, { backgroundColor: color, width: 14, height: 2.4 }]} />
      <View style={[styles.plusBar, { backgroundColor: color, width: 2.4, height: 14 }]} />
    </View>
  );
}

/** Marcador de ponto de 22 px (canvas da 4.5, folha Registrar): anel com o miolo, sem biblioteca de ícones. */
export function PinGlyph({ color }: { color: string }) {
  return (
    <View style={styles.pin} {...HIDDEN}>
      <View style={[styles.pinRing, { borderColor: color }]}>
        <View style={[styles.pinDot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plus: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  plusBar: { position: "absolute", borderRadius: 1.2 },
  pin: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  pinRing: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  pinDot: { width: 6, height: 6, borderRadius: 3 },
  gear: { fontSize: 22, lineHeight: 26 },
  search: { width: 18, height: 18 },
  lens: { position: "absolute", left: 1, top: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  handle: { position: "absolute", left: 11, top: 14, width: 7, height: 2, borderRadius: 1, transform: [{ rotate: "45deg" }] },
  cross: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  bar: { position: "absolute", width: 16, height: 2, borderRadius: 1 },
});
