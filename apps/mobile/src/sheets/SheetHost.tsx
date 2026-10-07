/** Desenha a pilha: a folha-base e, por cima, cada folha empilhada (a última recebe o toque). */
import { StyleSheet, View } from "react-native";
import { AheadSheet } from "./AheadSheet";
import { AlightSheet } from "./AlightSheet";
import { BackupImportSheet } from "./BackupImportSheet";
import { BoardSheet } from "./BoardSheet";
import { TripSheet } from "./TripSheet";
import { StackDiagStrip } from "./diagScroll";
import { ClockPickerSheet } from "./ClockPickerSheet";
import { HomeSheet } from "./HomeSheet";
import { RecordSheet } from "./RecordSheet";
import { RecordsSheet } from "./RecordsSheet";
import { SearchSheet } from "./SearchSheet";
import { SettingsSheet } from "./SettingsSheet";
import { useSheets } from "./SheetsContext";
import { StopSheet } from "./StopSheet";
import { VerifySheet } from "./VerifySheet";
import { PlacesSheet } from "./PlacesSheet";
import { PlaceSheet } from "./PlaceSheet";
import { RouteSheet } from "./RouteSheet";
import { OptionSheet } from "./OptionSheet";
import { AlightPickerSheet } from "./AlightPickerSheet";
import { GotoSheet } from "./GotoSheet";
import { RepeatSheet } from "./RepeatSheet";
import { AlarmsSheet } from "./AlarmsSheet";
import { AlarmIntroSheet } from "./AlarmIntroSheet";
import { CloseSheetProvider } from "./StackedSheet";
import { type SheetEntry, stackedSheets } from "./stack";

export function SheetHost({ customBase }: { customBase?: React.ReactNode } = {}) {
  const { state } = useSheets();
  const stacked = stackedSheets(state);
  // As folhas de baixo ficam sem toque, para os gesture handlers delas não disputarem o gesto com a folha do topo.

  return (
    <>
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents={stacked.length > 0 ? "none" : "box-none"}
      >
        {customBase ?? <HomeSheet />}
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
    case "backupImport":
      return <BackupImportSheet id={entry.id} />;
    case "record":
      return <RecordSheet id={entry.id} observationId={entry.observationId} />;
    case "verify":
      return <VerifySheet id={entry.id} observationId={entry.observationId} />;
    case "records":
      return <RecordsSheet id={entry.id} />;
    case "places":
      return <PlacesSheet id={entry.id} />;
    case "place":
      return <PlaceSheet id={entry.id} placeId={entry.placeId} initialName={entry.initialName} />;
    case "route":
      return <RouteSheet id={entry.id} routeId={entry.routeId} />;
    case "option":
      return (
        <OptionSheet
          id={entry.id}
          routeId={"routeId" in entry ? entry.routeId : undefined}
          optionId={"optionId" in entry ? entry.optionId : undefined}
          originPlaceId={"originPlaceId" in entry ? entry.originPlaceId : undefined}
          destinationPlaceId={"destinationPlaceId" in entry ? entry.destinationPlaceId : undefined}
        />
      );
    case "alightPicker":
      return (
        <AlightPickerSheet
          id={entry.id}
          routeId={entry.routeId}
          patternId={entry.patternId}
          boardPosition={entry.boardPosition}
          currentAlightPatternStopId={entry.currentAlightPatternStopId}
        />
      );
    case "goto":
      return (
        <GotoSheet
          id={entry.id}
          destinationPlaceId={entry.destinationPlaceId}
          originPlaceId={entry.originPlaceId}
        />
      );
    case "repeat":
      return <RepeatSheet id={entry.id} alarmId={entry.alarmId} />;
    case "alarms":
      return <AlarmsSheet id={entry.id} />;
    case "alarmIntro":
      return (
        <AlarmIntroSheet
          id={entry.id}
          mode={entry.mode}
          onResolve={entry.onResolve}
        />
      );
    case "home":
      return null;
  }
}
