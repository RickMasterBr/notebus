/** Desenha a pilha: a folha-base e, por cima, cada folha empilhada (a última recebe o toque). */
import { StyleSheet, View } from "react-native";
import { AheadSheet } from "./AheadSheet";
import { HomeSheet } from "./HomeSheet";
import { SearchSheet } from "./SearchSheet";
import { useSheets } from "./SheetsContext";
import { StopSheet } from "./StopSheet";
import { useScrollVariant } from "./diagScroll";
import { type SheetEntry, stackedSheets } from "./stack";

export function SheetHost() {
  const { state } = useSheets();
  const stacked = stackedSheets(state);
  const variant = useScrollVariant();
  // V1, V2 e V3 desarmam a folha de baixo para que seus gesture handlers não disputem o toque com a folha do topo
  const disableCovered = variant !== "V0";

  return (
    <>
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents={disableCovered && stacked.length > 0 ? "none" : "box-none"}
      >
        <HomeSheet />
      </View>
      {stacked.map((entry, i) => {
        const isTop = i === stacked.length - 1;
        return (
          // Só a do topo é lida pelo VoiceOver e recebe toques quando coberta (nas variantes corrigidas)
          <View
            key={entry.id}
            style={StyleSheet.absoluteFill}
            pointerEvents={disableCovered && !isTop ? "none" : "box-none"}
            accessibilityElementsHidden={!isTop}
            importantForAccessibility={!isTop ? "no-hide-descendants" : "auto"}
          >
            <StackedSheetSlot entry={entry} />
          </View>
        );
      })}
    </>
  );
}

function StackedSheetSlot({ entry }: { entry: SheetEntry }) {
  switch (entry.kind) {
    case "search":
      return <SearchSheet id={entry.id} />;
    case "stop":
      return <StopSheet id={entry.id} stopId={entry.stopId} name={entry.name} />;
    case "ahead":
      return <AheadSheet id={entry.id} tripId={entry.tripId} position={entry.position} />;
    case "home":
      return null;
  }
}
