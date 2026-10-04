/**
 * O cartão "Em viagem" puxado para cima (D-075; plano E-03 §4): as paragens que faltam até o **fim do percurso**, com a
 * hora prevista deslocada pelo atraso da própria viagem (`shiftMinutes`, D-070) e "2ª passagem" onde o percurso repete o
 * ponto. **Só leitura**: nada é gravado. Reaproveita `Header`, `Body` e `Timeline` da TL-05 sem reescrevê-los
 * (`AheadSheet`); a moldura é a mesma (detent único de 90%, lista na receita da D-150).
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { createContext, useContext, useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegistro } from "../data/RegistroProvider";
import { space } from "../theme";
import { Body, Header } from "./AheadSheet";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function TripHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["90%"], initialIndex: 0, Handle: TripHandle };

export function TripSheet({ id }: { id: number }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { tripCard: card, status } = useRegistro();
  const close = useCloseSheet();
  const [handleHeight, setHandleHeight] = useState(0);

  // A viagem acabou com a lista aberta (descida, dispensa ou fim do percurso): não há mais o que mostrar.
  useEffect(() => {
    if (status === "ready" && (card === null || card.ahead === null)) close();
  }, [status, card, close]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]?.scrollAreaHeight ?? 0),
  );
  const ahead = card?.ahead ?? null;

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + space.md, gap: space.md }}
            showsVerticalScrollIndicator={false}
          >
            <Header ahead={ahead} />
            {ahead ? <Body ahead={ahead} /> : null}
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}
