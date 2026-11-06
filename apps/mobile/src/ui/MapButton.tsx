import type { ReactNode } from "react";
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { elevation, minTouch, radius, useTheme } from "../theme";
import { pressedStyle } from "./pressed";

export interface MapButtonProps {
  glyph: ReactNode;
  accessibilityLabel: string;
  onPress?: () => void;
  marker?: boolean;
  hidden?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function MapButton({
  glyph,
  accessibilityLabel,
  onPress,
  marker = false,
  hidden = false,
  style,
}: MapButtonProps) {
  const { colors } = useTheme();

  if (hidden) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityShowsLargeContentViewer
      accessibilityLargeContentTitle={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.surface, borderColor: colors.divider },
        style,
        pressedStyle(pressed),
      ]}
    >
      {glyph}
      {marker && (
        <View
          style={[
            styles.marker,
            { backgroundColor: colors.accent, borderRadius: radius.full },
          ]}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: minTouch,
    height: minTouch,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.card,
  },
  marker: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
  },
});
