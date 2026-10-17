/**
 * Componente padrão para estados vazios do NoteBus (E-08.5 Bloco 14, D-198, D-207, ideias 2 e 51).
 * Arranjo da alta fidelidade (Vazio.dc.html).
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { pressedStyle } from "./pressed";

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

export interface EmptyStateProps {
  title: string;
  body: string;
  action?: EmptyStateAction;
  secondary?: EmptyStateAction;
  icon?: ReactNode;
  centered?: boolean;
}

export function EmptyState({
  title,
  body,
  action,
  secondary,
  icon,
  centered = true,
}: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, centered && styles.centered]}>
      {icon ? (
        <View style={[styles.iconBox, { backgroundColor: colors.fill }]}>
          {icon}
        </View>
      ) : null}

      <Text
        accessibilityRole="header"
        style={[type.title, styles.title, { color: colors.text }]}
      >
        {title}
      </Text>

      <Text
        style={[type.body, styles.body, { color: colors.textSecondary }]}
      >
        {body}
      </Text>

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.accent }, pressedStyle(pressed)]}
        >
          <Text
            style={[type.bodyStrong, styles.actionLabel, { color: colors.onAccent }]}
          >
            {action.label}
          </Text>
        </Pressable>
      ) : null}

      {secondary ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondary.label}
          onPress={secondary.onPress}
          style={({ pressed }) => [styles.secondaryButton, pressedStyle(pressed)]}
        >
          <Text
            style={[type.bodyStrong, styles.secondaryLabel, { color: colors.accent }]}
          >
            {secondary.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.md,
    gap: 14,
  },
  centered: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xl,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: radius.lg, // 20 pt, token mais próximo de 18
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  title: {
    fontSize: 21,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 290,
  },
  actionButton: {
    minHeight: 50,
    borderRadius: radius.full,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.xs,
    minWidth: minTouch,
  },
  actionLabel: {
    textAlign: "center",
  },
  secondaryButton: {
    minHeight: minTouch,
    minWidth: minTouch,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryLabel: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.8,
  },
});
