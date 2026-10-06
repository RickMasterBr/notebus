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

/** Ícone de informação de 14 px: círculo com borda e ponto/haste verticais, sem caractere Unicode. */
export function InfoGlyph({ color }: { color: string }) {
  return (
    <View style={styles.info} {...HIDDEN}>
      <View style={[styles.infoRing, { borderColor: color }]}>
        <View style={[styles.infoDot, { backgroundColor: color }]} />
        <View style={[styles.infoBar, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

/** Ícone de confirmação (check) de 14 px: duas hastes em ângulo reto desenhadas com bordas e rotacionadas em 45°. */
export function CheckGlyph({ color }: { color: string }) {
  return (
    <View style={styles.check} {...HIDDEN}>
      <View style={[styles.checkStem, { borderColor: color }]} />
    </View>
  );
}

/** Glifo de embarque de 14 px: seta apontando para cima, desenhada com Views. */
export function BoardGlyph({ color }: { color: string }) {
  return (
    <View style={styles.arrow} {...HIDDEN}>
      <View style={[styles.arrowHeadUp, { borderColor: color }]} />
      <View style={[styles.arrowStemV, { backgroundColor: color }]} />
    </View>
  );
}

/** Glifo de descida de 14 px: seta apontando para baixo, desenhada com Views. */
export function AlightGlyph({ color }: { color: string }) {
  return (
    <View style={styles.arrow} {...HIDDEN}>
      <View style={[styles.arrowStemV, { backgroundColor: color }]} />
      <View style={[styles.arrowHeadDown, { borderColor: color }]} />
    </View>
  );
}

/** Glifo de vi passar de 14 px: seta horizontal apontando para a direita, desenhada com Views. */
export function PassGlyph({ color }: { color: string }) {
  return (
    <View style={styles.arrow} {...HIDDEN}>
      <View style={[styles.arrowStemH, { backgroundColor: color }]} />
      <View style={[styles.arrowHeadRight, { borderColor: color }]} />
    </View>
  );
}

/** "-" de 22 px (par de PlusGlyph para os ajustes de -/+ 1 minuto). */
export function MinusGlyph({ color }: { color: string }) {
  return (
    <View style={styles.plus} {...HIDDEN}>
      <View style={[styles.plusBar, { backgroundColor: color, width: 14, height: 2.4 }]} />
    </View>
  );
}

/** Ícone de arrastar para reordenar (duas barras horizontais). */
export function DragHandleGlyph({ color }: { color: string }) {
  return (
    <View style={styles.dragHandle} {...HIDDEN}>
      <View style={[styles.dragBar, { backgroundColor: color }]} />
      <View style={[styles.dragBar, { backgroundColor: color }]} />
    </View>
  );
}

/** Seta chevron para a direita (indicador de navegação de item). */
export function ChevronRightGlyph({ color }: { color: string }) {
  return (
    <View style={styles.chevronRight} {...HIDDEN}>
      <View style={[styles.chevronArm, { borderColor: color }]} />
    </View>
  );
}

/** Ícone de lugar estilizado (casa, faculdade/escola, academia/esporte, estrela, padrão). */
export function PlaceIconGlyph({ icon, color, size = 20 }: { icon?: string | null; color: string; size?: number }) {
  switch (icon) {
    case "house":
    case "casa":
      return (
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} {...HIDDEN}>
          <View style={{ width: 0, height: 0, borderLeftWidth: size * 0.38, borderRightWidth: size * 0.38, borderBottomWidth: size * 0.35, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: color }} />
          <View style={{ width: size * 0.58, height: size * 0.42, backgroundColor: color }} />
        </View>
      );
    case "school":
    case "facul":
      return (
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} {...HIDDEN}>
          <View style={{ width: size * 0.75, height: size * 0.25, backgroundColor: color, transform: [{ rotate: "-15deg" }] }} />
          <View style={{ width: size * 0.5, height: size * 0.35, borderWidth: 1.5, borderColor: color, borderTopWidth: 0 }} />
        </View>
      );
    case "gym":
    case "academia":
      return (
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 1 }} {...HIDDEN}>
          <View style={{ width: 3, height: size * 0.6, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ width: size * 0.35, height: 2.5, backgroundColor: color }} />
          <View style={{ width: 3, height: size * 0.6, backgroundColor: color, borderRadius: 1 }} />
        </View>
      );
    case "star":
      return (
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} {...HIDDEN}>
          <View style={{ width: size * 0.5, height: size * 0.5, borderWidth: 2, borderColor: color, transform: [{ rotate: "45deg" }] }} />
        </View>
      );
    default:
      return <PinGlyph color={color} />;
  }
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
  info: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  infoRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 1.5,
  },
  infoDot: { width: 1.6, height: 1.6, borderRadius: 0.8 },
  infoBar: { width: 1.6, height: 4.5, borderRadius: 0.8 },
  check: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  checkStem: {
    width: 4.5,
    height: 8.5,
    borderBottomWidth: 1.8,
    borderRightWidth: 1.8,
    borderRadius: 0.5,
    transform: [{ rotate: "45deg" }, { translateY: -1 }],
  },
  arrow: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  arrowHeadUp: {
    width: 6,
    height: 6,
    borderTopWidth: 1.8,
    borderLeftWidth: 1.8,
    transform: [{ rotate: "45deg" }],
    marginBottom: -1,
  },
  arrowHeadDown: {
    width: 6,
    height: 6,
    borderBottomWidth: 1.8,
    borderRightWidth: 1.8,
    transform: [{ rotate: "45deg" }],
    marginTop: -1,
  },
  arrowHeadRight: {
    position: "absolute",
    right: 1,
    width: 6,
    height: 6,
    borderTopWidth: 1.8,
    borderRightWidth: 1.8,
    transform: [{ rotate: "45deg" }],
  },
  arrowStemV: { width: 1.8, height: 6.5, borderRadius: 0.9 },
  arrowStemH: { width: 7.5, height: 1.8, borderRadius: 0.9, alignSelf: "center", marginLeft: -2 },
  dragHandle: { width: 20, height: 20, alignItems: "center", justifyContent: "center", gap: 3 },
  dragBar: { width: 14, height: 2, borderRadius: 1 },
  chevronRight: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  chevronArm: {
    width: 6,
    height: 6,
    borderTopWidth: 2,
    borderRightWidth: 2,
    transform: [{ rotate: "45deg" }],
    marginLeft: -2,
  },
});
