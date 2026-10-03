/** Handle da folha (4.4 §5.11): barra de 36×4, `grab`, `space.sm` do topo. */
import { Pressable, StyleSheet, View } from "react-native";
import { space, useTheme } from "../theme";

type Props =
  | {
      /** Folha empilhada: tocar no handle fecha. */
      kind: "close";
      onPress: () => void;
      accessibilityLabel: string;
    }
  | {
      /** Folha inicial: controle ajustável do VoiceOver (deslizar para cima/baixo muda o detent). */
      kind: "adjustable";
      onIncrement: () => void;
      onDecrement: () => void;
    };

const HIT_SLOP = { top: 12, bottom: 12, left: 48, right: 48 } as const;

export function SheetHandle(props: Props) {
  const { colors } = useTheme();
  const bar = <View style={[styles.bar, { backgroundColor: colors.grab }]} />;

  if (props.kind === "close") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.accessibilityLabel}
        hitSlop={HIT_SLOP}
        onPress={props.onPress}
        style={styles.area}
      >
        {bar}
      </Pressable>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="adjustable"
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
}

const styles = StyleSheet.create({
  area: { alignItems: "center", paddingTop: space.sm, paddingBottom: space.sm },
  bar: { width: 36, height: 4, borderRadius: 2 },
});
