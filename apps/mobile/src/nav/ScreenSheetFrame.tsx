/** Moldura de uma folha dentro de tela nativa: uma altura só (100%), sem arrastar para fechar e sem fundo escurecido. */
import BottomSheet from "@gorhom/bottom-sheet";
import type { ComponentType, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCloseSheet } from "../sheets/StackedSheet";
import { useTheme } from "../theme";

const FULL = ["100%"];

export function ScreenSheetFrame({ Handle, children }: { Handle?: ComponentType<{ onClose: () => void }>; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const close = useCloseSheet();
  return (
    <View style={[styles.fill, { backgroundColor: colors.surface }]}>
      <BottomSheet
        accessible={false}
        accessibilityRole={null}
        accessibilityLabel={null}
        index={0}
        snapPoints={FULL}
        enableDynamicSizing={false}
        animateOnMount={false}
        enablePanDownToClose={false}
        enableHandlePanningGesture={false}
        enableContentPanningGesture={false}
        topInset={insets.top}
        handleComponent={Handle ? () => <Handle onClose={close} /> : null}
        backgroundStyle={{ backgroundColor: colors.surface }}
      >
        <View collapsable={false} style={[styles.fill, { paddingHorizontal: 16, paddingBottom: insets.bottom }]}>{children}</View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
