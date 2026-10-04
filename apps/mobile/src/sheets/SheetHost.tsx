/** Desenha a pilha: a folha-base e, por cima, cada folha empilhada (a última recebe o toque). */
import { StyleSheet, View } from "react-native";
import { AheadSheet } from "./AheadSheet";
import { AlightSheet } from "./AlightSheet";
import { BoardSheet } from "./BoardSheet";
import { TripSheet } from "./TripSheet";
import { StackDiagStrip } from "./diagScroll";
import { ClockPickerSheet } from "./ClockPickerSheet";
import { HomeSheet } from "./HomeSheet";
import { SearchSheet } from "./SearchSheet";
import { SettingsSheet } from "./SettingsSheet";
import { useSheets } from "./SheetsContext";
import { StopSheet } from "./StopSheet";
import { CloseSheetProvider } from "./StackedSheet";
import { type SheetEntry, stackedSheets } from "./stack";

export function SheetHost() {
  const { state } = useSheets();
  const stacked = stackedSheets(state);
  // As folhas de baixo ficam sem toque, para os gesture handlers delas não disputarem o gesto com a folha do topo.

  return (
    <>
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents={stacked.length > 0 ? "none" : "box-none"}
      >
        <HomeSheet />
      </View>
      {stacked.map((entry, i) => {
        const isTop = i === stacked.length - 1;
        return (
          // Só a do topo é lida pelo VoiceOver e recebe toques quando coberta 
          <View
            key={entry.id}
            style={StyleSheet.absoluteFill}
            pointerEvents={!isTop ? "none" : "box-none"}
            accessibilityElementsHidden={!isTop}
            importantForAccessibility={!isTop ? "no-hide-descendants" : "auto"}
          >
            <StackedSheetSlot entry={entry} />
          </View>
        );
      })}
      <StackDiagStrip />
    </>
  );
}

function StackedSheetSlot({ entry }: { entry: SheetEntry }) {
  return (
    <CloseSheetProvider id={entry.id}>
      <StackedSheetContent entry={entry} />
    </CloseSheetProvider>
  );
}

function StackedSheetContent({ entry }: { entry: SheetEntry }) {
  switch (entry.kind) {
    case "search":
      return <SearchSheet id={entry.id} pick={entry.pick === true} />;
    case "board":
      return <BoardSheet id={entry.id} stopId={entry.stopId} />;
    case "alight":
      return <AlightSheet id={entry.id} />;
    case "trip":
      return <TripSheet id={entry.id} />;
    case "stop":
      return <StopSheet id={entry.id} stopId={entry.stopId} name={entry.name} />;
    case "ahead":
      return <AheadSheet id={entry.id} tripId={entry.tripId} position={entry.position} />;
    case "settings":
      return <SettingsSheet id={entry.id} />;
    case "clockPicker":
      return <ClockPickerSheet id={entry.id} />;
    case "home":
      return null;
  }
}
