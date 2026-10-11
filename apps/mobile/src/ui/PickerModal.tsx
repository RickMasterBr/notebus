/** Moldura do seletor nativo de hora/data no iPhone (E-08 bloco 6, E1): o fundo e a caixa são irmãos, para o VoiceOver alcançar o seletor e o Pronto. */
import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";

export function PickerModal({
  visible,
  onClose,
  children,
  doneLabel,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  doneLabel: string;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.screen}>
        <Pressable
          accessible={false}
          accessibilityLabel={t("common.close")}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[styles.box, { backgroundColor: colors.surface }]}
        >
          {children}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={doneLabel}
            onPress={onDone}
            style={[styles.doneButton, { backgroundColor: colors.fill }]}
          >
            <Text style={[type.bodyStrong, { color: colors.text }]}>{doneLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", alignItems: "center", padding: space.md },
  box: { borderRadius: radius.lg, padding: space.md, width: "100%", maxWidth: 360, gap: space.md },
  doneButton: { alignSelf: "stretch", minHeight: minTouch, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
