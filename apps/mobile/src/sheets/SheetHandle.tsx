/**
 * Handle da folha (4.4 §5.11): barra de 36×4, `grab`, `space.sm` do topo.
 * Folha empilhada de 1 altura: o handle fecha ao tocar e há também o ✕ "Fechar" (D-129).
 * Folha inicial: controle ajustável, com rótulo `sheet.handle.a11y` e valor `sheet.detent.*` (D-129).
 * Folha empilhada de 3 detents (a do ponto, TL-02): ajustável como a inicial, mais o ✕ "Fechar" (D-135) em `onClose`.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../i18n";
import { minTouch, space, useTheme } from "../theme";
import { CrossGlyph } from "../ui/Glyphs";
import { useScreenEntry } from "../nav/ScreenContext";
import { ScreenBackButton } from "../nav/ScreenBackButton";
import type { Detent } from "./stack";
import { pressedStyle } from "../ui/pressed";

type Props =
  | {
      kind: "close";
      onPress: () => void;
      hideCloseButton?: boolean;
    }
  | {
      kind: "adjustable";
      detent: Detent;
      onIncrement: () => void;
      onDecrement: () => void;
      /** Folha empilhada: acrescenta o ✕ "Fechar" à direita. */
      onClose?: () => void;
    };

const HIT_SLOP = { top: 12, bottom: 12, left: 48, right: 48 } as const;

function detentText(detent: Detent): string {
  return detent === 0 ? t("sheet.detent.small") : detent === 1 ? t("sheet.detent.medium") : t("sheet.detent.large");
}

export function SheetHandle(props: Props) {
  const { colors } = useTheme();
  const bar = <View style={[styles.bar, { backgroundColor: colors.grab }]} />;

  if (props.kind === "close") {
    const screen = useScreenEntry();
    return (
      <View style={styles.closeRow}>
        {/* A barrinha só existe fora de tela: dentro de tela o topo é do botão de voltar. */}
        {!screen && (
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            hitSlop={HIT_SLOP}
            onPress={props.onPress}
            style={styles.area}
          >
            {bar}
          </Pressable>
        )}
        {!props.hideCloseButton && <CloseOrBack onPress={props.onPress} />}
      </View>
    );
  }
  const adjustable = (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t("sheet.handle.a11y")}
      accessibilityValue={{ text: detentText(props.detent) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") props.onIncrement();
        else if (event.nativeEvent.actionName === "decrement") props.onDecrement();
      }}
      style={styles.area}
    >
      {bar}
    </View>
  );
  if (!props.onClose) return adjustable;
  return (
    <View style={styles.closeRow}>
      {adjustable}
      <CloseOrBack onPress={props.onClose} />
    </View>
  );
}

/** Dentro de tela o topo mostra o botão de voltar; fora de tela (folha e modal) continua o ✕. */
function CloseOrBack({ onPress }: { onPress: () => void }) {
  const screen = useScreenEntry();
  return screen ? <ScreenBackButton onPress={onPress} /> : <CloseButton onPress={onPress} />;
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.close")}
      hitSlop={space.xs}
      onPress={onPress}
      style={({ pressed }) => [styles.closeButton, pressedStyle(pressed)]}
    >
      <CrossGlyph color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  area: { alignItems: "center", paddingTop: space.sm, paddingBottom: space.sm },
  bar: { width: 36, height: 4, borderRadius: 2 },
  // Linha do topo da folha empilhada: handle no centro, ✕ à direita (alvo de 44 px, sem pedir mais altura que isso).
  closeRow: { minHeight: minTouch, justifyContent: "flex-start" },
  closeButton: {
    position: "absolute",
    top: 0,
    right: space.sm,
    width: minTouch,
    height: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
});
