/** Desenha a pilha: a folha-base e, por cima, cada folha empilhada (a última recebe o toque). */
import { StyleSheet, View } from "react-native";
import { HomeSheet } from "./HomeSheet";
import { SearchSheet } from "./SearchSheet";
import { useSheets } from "./SheetsContext";
import { StopSheet } from "./StopSheet";
import { type SheetEntry, stackedSheets } from "./stack";

export function SheetHost() {
  const { state } = useSheets();
  const stacked = stackedSheets(state);
  return (
    <>
      <HomeSheet />
      {stacked.map((entry, i) => (
        // Só a do topo é lida pelo VoiceOver: as de baixo ficam escondidas enquanto houver outra por cima.
        <View
          key={entry.id}
          style={StyleSheet.absoluteFill}
          pointerEvents="box-none"
          accessibilityElementsHidden={i < stacked.length - 1}
          importantForAccessibility={i < stacked.length - 1 ? "no-hide-descendants" : "auto"}
        >
          <StackedSheetSlot entry={entry} />
        </View>
      ))}
    </>
  );
}

function StackedSheetSlot({ entry }: { entry: SheetEntry }) {
  switch (entry.kind) {
    case "search":
      return <SearchSheet id={entry.id} />;
    case "stop":
      return <StopSheet id={entry.id} stopId={entry.stopId} name={entry.name} />;
    case "home":
      return null;
  }
}
