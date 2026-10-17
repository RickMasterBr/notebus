import { Pressable } from "react-native";
import { useTheme } from "../theme";
import { AnimatedSwitchVisual } from "./AnimatedSwitchVisual";

export const NB_SWITCH_HEIGHT = 31;
/** Folga do toque acima e abaixo do visual: 31 + 2 x 7 = 45 pt (mínimo 44). */
export const NB_SWITCH_HIT_SLOP = 7;

/** Interruptor de Ajustes sem o Switch nativo (FN-23): cada toque chega, o hook inverte o valor mostrado. */
export function NbSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  diagLabel,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  /** Só para o registro de diagnóstico (DIAG_SCROLL). */
  diagLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      hitSlop={{ top: NB_SWITCH_HIT_SLOP, bottom: NB_SWITCH_HIT_SLOP }}
      style={{ alignSelf: "center" }}
    >
      <AnimatedSwitchVisual on={value} offColor={colors.switchTrackOff} diagLabel={diagLabel} />
    </Pressable>
  );
}
