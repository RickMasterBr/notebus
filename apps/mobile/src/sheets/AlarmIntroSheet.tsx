/**
 * TL-04 Introdução, permissão e modo Foco dos avisos (E-06 Bloco 3, Item 5).
 *
 * Folha empilhada de um detent, sem espaçador, um só ✕ (o padrão do SheetHandle).
 * Três modos:
 * - reason: frase de motivo para pedir permissão, botões "Continuar" e "Agora não".
 * - denied: explica que permissão foi negada e oferece "Abrir Ajustes do iPhone".
 * - focus: orientação honesta sobre o modo Foco e os 4 passos escritos.
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { createContext, useContext, useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function IntroHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["82%"], initialIndex: 0, Handle: IntroHandle };

export type AlarmIntroMode = "reason" | "denied" | "focus";

export function AlarmIntroSheet({
  id,
  mode,
  onResolve,
}: {
  id: number;
  mode: AlarmIntroMode;
  onResolve?: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const close = useCloseSheet();
  const [handleHeight, setHandleHeight] = useState(0);

  // Garante que o ask nunca fica pendurado se fechar pelo ✕, gesto ou desmontagem
  useEffect(() => {
    return () => {
      onResolve?.(false);
    };
  }, [onResolve]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const handleContinue = () => {
    onResolve?.(true);
    close();
  };

  const handleLater = () => {
    onResolve?.(false);
    close();
  };

  const handleOpenSettings = () => {
    void Linking.openSettings();
  };

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            style={{ height: scrollAreaHeight }}
            contentContainerStyle={styles.scrollContent}
          >
            {mode === "reason" && (
              <View style={styles.section}>
                <Text style={[type.title, { color: colors.text }]}>
                  {t("alarm.intro.title")}
                </Text>
                <Text style={[type.body, { color: colors.textSecondary }]}>
                  {t("alarm.intro.reason")}
                </Text>

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("alarm.intro.continue")}
                    onPress={handleContinue}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: colors.accent },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                      {t("alarm.intro.continue")}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("alarm.intro.later")}
                    onPress={handleLater}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { backgroundColor: colors.fill },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[type.bodyStrong, { color: colors.text }]}>
                      {t("alarm.intro.later")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {mode === "denied" && (
              <View style={styles.section}>
                <Text style={[type.title, { color: colors.text }]}>
                  {t("alarm.denied.title")}
                </Text>
                <Text style={[type.body, { color: colors.textSecondary }]}>
                  {t("alarm.denied.body")}
                </Text>

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("alarm.denied.open")}
                    onPress={handleOpenSettings}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: colors.accent },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                      {t("alarm.denied.open")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {mode === "focus" && (
              <View style={styles.section}>
                <Text style={[type.title, { color: colors.text }]}>
                  {t("alarm.focus.title")}
                </Text>
                <Text style={[type.body, { color: colors.textSecondary }]}>
                  {t("alarm.focus.body")}
                </Text>

                <View style={styles.stepsContainer}>
                  <View style={styles.stepRow}>
                    <Text style={[type.bodyStrong, { color: colors.accent }]}>1.</Text>
                    <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                      {t("alarm.focus.step1")}
                    </Text>
                  </View>
                  <View style={styles.stepRow}>
                    <Text style={[type.bodyStrong, { color: colors.accent }]}>2.</Text>
                    <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                      {t("alarm.focus.step2")}
                    </Text>
                  </View>
                  <View style={styles.stepRow}>
                    <Text style={[type.bodyStrong, { color: colors.accent }]}>3.</Text>
                    <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                      {t("alarm.focus.step3")}
                    </Text>
                  </View>
                  <View style={styles.stepRow}>
                    <Text style={[type.bodyStrong, { color: colors.accent }]}>4.</Text>
                    <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                      {t("alarm.focus.step4")}
                    </Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("alarm.focus.done")}
                    onPress={close}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: colors.accent },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                      {t("alarm.focus.done")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
  },
  section: {
    gap: space.md,
    paddingTop: space.xs,
  },
  stepsContainer: {
    gap: space.sm,
    paddingVertical: space.xs,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  actions: {
    gap: space.sm,
    paddingTop: space.md,
  },
  primaryButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  secondaryButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
});
