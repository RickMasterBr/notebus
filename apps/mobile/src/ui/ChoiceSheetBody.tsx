/**
 * Corpo da folha de escolha (componentes-v1.md §2.6, D-403, D-416).
 * Recebe os textos prontos e repassa ações.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph } from "./Glyphs";
import { NoticeLine } from "./NoticeCard";
import { pressedStyle } from "./pressed";

export interface ChoiceOption {
  id: string;
  label: string;
  tone: "primary" | "danger" | "plain" | "cancel";
}

export interface ChoiceSheetBodyProps {
  title: string;
  subtitle?: string;
  error?: string;
  options: readonly ChoiceOption[];
  onSelect: (id: string) => void;
  busy?: boolean;
}

export function ChoiceSheetBody({
  title,
  subtitle,
  error,
  options,
  onSelect,
  busy = false,
}: ChoiceSheetBodyProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[type.body, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      ) : null}

      {error ? <NoticeLine text={error} tone="danger" /> : null}

      <View style={styles.optionsCol}>
        {options.map((opt) => {
          let bg = colors.fill;
          let textColor = colors.text;

          if (opt.tone === "primary") {
            bg = colors.accent;
            textColor = colors.onAccent;
          } else if (opt.tone === "danger") {
            bg = colors.fill;
            textColor = colors.danger;
          } else if (opt.tone === "plain") {
            bg = colors.fill;
            textColor = colors.text;
          } else if (opt.tone === "cancel") {
            bg = "transparent";
            textColor = colors.accent;
          }

          return (
            <Pressable
              key={opt.id}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              disabled={busy}
              accessibilityState={{ disabled: busy }}
              onPress={() => onSelect(opt.id)}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: bg },
                pressedStyle(pressed),
              ]}
            >
              {opt.tone === "danger" ? <CrossGlyph color={colors.danger} /> : null}
              <Text style={[type.bodyStrong, { color: textColor }]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.md,
  },
  optionsCol: {
    flexDirection: "column",
    gap: space.sm,
  },
  option: {
    minHeight: Math.max(minTouch, 52),
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
  },
});
