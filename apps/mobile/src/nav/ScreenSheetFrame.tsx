/** Moldura de uma folha dentro de tela nativa: uma altura só (100%), sem arrastar para fechar e sem fundo escurecido. Só monta a folha após medir a altura da tela [hipótese, só o aparelho decide]. */
import BottomSheet from "@gorhom/bottom-sheet";
import { type ComponentType, type ReactNode, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCloseSheet } from "../sheets/StackedSheet";
import { useTheme } from "../theme";
import { type FrameLayoutState, frameLayoutState, heightChanged } from "./frameLayout";

const FULL = ["100%"];

export function ScreenSheetFrame({ Handle, children }: { Handle?: ComponentType<{ onClose: () => void }>; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [frameHeight, setFrameHeight] = useState(0);

  return (
    <View
      style={[styles.fill, { backgroundColor: colors.surface }]}
      onLayout={(e) => {
        const next = e.nativeEvent.layout.height;
        setFrameHeight((previous) => (heightChanged(previous, next) ? next : previous));
      }}
    >
      {frameLayoutState(frameHeight, insets.top) !== null ? (
        <MeasuredFrame frameHeight={frameHeight} Handle={Handle}>
          {children}
        </MeasuredFrame>
      ) : null}
    </View>
  );
}

function MeasuredFrame({
  frameHeight,
  Handle,
  children,
}: {
  frameHeight: number;
  Handle?: ComponentType<{ onClose: () => void }>;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const close = useCloseSheet();
  const layoutState = useSharedValue<FrameLayoutState>(frameLayoutState(frameHeight, insets.top) as FrameLayoutState);

  return (
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
      containerLayoutState={layoutState}
      handleComponent={Handle ? () => <Handle onClose={close} /> : null}
      backgroundStyle={{ backgroundColor: colors.surface }}
    >
      <View collapsable={false} style={[styles.fill, { paddingHorizontal: 16, paddingBottom: insets.bottom }]}>
        {children}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
