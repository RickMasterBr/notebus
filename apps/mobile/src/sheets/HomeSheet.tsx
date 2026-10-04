/**
 * Folha inicial da TL-01 (4.4 §5.1, variante inicial): 3 detents.
 * Abre no médio se há recentes e no pequeno se não há (D-141, só na abertura a frio). Tocar fora no médio ou no grande
 * leva ao pequeno (D-145), sem repassar o toque e sem háptico.
 * Pequeno = só o handle e a pílula, medidos na tela (crescem com o Dynamic Type e nunca cortam), médio = 50%, grande = 90%.
 * Médio e grande mostram "Perto de você" (4.1 §4); o que a 4.1 lista para o grande (Trajetos, Registros recentes,
 * Rede e Ajustes) ainda não existe e não aparece.
 *
 * E-03: o cartão "Em viagem" (enquanto houver `ride` aberto) é um filho FIXO acima da pílula, e o botão flutuante
 * "Registrar" acompanha o topo da folha (`animatedPosition`), no canto de baixo à direita, em qualquer detent. O cartão
 * entra na altura pela mesma conta da pílula (medido por `onLayout`, sem constante nova, sem espaçador novo, sem estado
 * do `onChange` e sem remontar a lista): o detent pequeno cresce com ele e a lista tem a altura da folha aberta menos
 * handle, cartão e pílula.
 *
 * E-03 bloco 3: o lembrete de backup (D-088) fica logo abaixo do cartão "Em viagem", no mesmo bloco medido: o detent
 * pequeno cresce o necessário para os dois, pela mesma conta.
 */
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetScrollView,
  useBottomSheet,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBackup } from "../data/BackupProvider";
import { useRecentStops } from "../data/RecentStopsProvider";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { initialDetent } from "../data/homeStart";
import { t } from "../i18n";
import { elevation, radius, space, useTheme } from "../theme";
import { REGISTER_BUTTON_HEIGHT, RegisterButton } from "../ui/RegisterButton";
import { SearchPill } from "../ui/SearchPill";
import { BackupReminderCard, TripCard } from "../ui/TripCard";
import { HiddenBelowSpacer } from "./HiddenBelowSpacer";
import { NearbyStops } from "./NearbyStops";
import { SheetHandle } from "./SheetHandle";
import { useSheets } from "./SheetsContext";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { detentFromIndex } from "./stack";

const LAST_INDEX = 2;
/** Altura do detent pequeno até a primeira medida (handle + pílula + margem de baixo). */
const SMALL_FALLBACK = 120;

export function HomeSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useSheets();
  const lastIndex = useRef<number | null>(null);
  const stops = useStopIndex();
  const schedule = useSchedule();
  const recent = useRecentStops();
  const listReady = stops.status !== "loading" && schedule.status !== "loading" && recent.status !== "loading";
  const { tripCard, notBoarded, dismiss } = useRegistro();
  const backup = useBackup();
  const reminder = backup.reminder.show
    ? backup.reminder.daysSince === null
      ? t("home.backup_reminder.body_never")
      : t("home.backup_reminder.body", { days: backup.reminder.daysSince })
    : null;
  const [handleHeight, setHandleHeight] = useState(0);
  const [pillHeight, setPillHeight] = useState(0);
  // Altura medida do cartão "Em viagem" e do lembrete de backup (com o espaço até a pílula); 0 sem nenhum dos dois.
  const [cardHeight, setCardHeight] = useState(0);
  const effectiveCardHeight = tripCard || reminder ? cardHeight : 0;
  const small = handleHeight > 0 && pillHeight > 0 ? handleHeight + effectiveCardHeight + pillHeight + insets.bottom + space.md : SMALL_FALLBACK;
  // Topo da folha, medido pela biblioteca (já com a área segura de cima): o botão "Registrar" sobe e desce com ele.
  // Começa fora da tela até a primeira medida.
  const window = useWindowDimensions();
  const sheetTop = useSharedValue(window.height + 200);
  const fabStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTop.value - REGISTER_BUTTON_HEIGHT - space.md }] }));
  const snapPoints = useMemo(() => [small, "50%", "90%"], [small]);
  // Com folha empilhada por cima, a de baixo sai da leitura do VoiceOver.
  const covered = state.stack.length > 1;
  const pill = useRef<View>(null);
  const wasCovered = useRef(false);
  // D-141: o detent da abertura a frio é decidido uma vez, quando os recentes chegam (leitura local, curta). Até lá a
  // folha não é montada, para não abrir pequena e saltar para o médio; depois, fica onde o Rick a deixou.
  const [startIndex, setStartIndex] = useState<number | null>(null);
  useEffect(() => {
    if (startIndex === null && recent.status === "ready") {
      const detent = initialDetent(recent.ids.length);
      setStartIndex(detent);
      dispatch({ type: "setDetent", detent });
    }
  }, [startIndex, recent.status, recent.ids.length, dispatch]);
  // O recolher por toque fora não é um encaixe por gesto: sem háptico (D-145, 4.5 §2.6).
  const skipHaptic = useRef(false);

  // Ao fechar a Busca (a base volta a ser a do topo), o foco do VoiceOver volta para a pílula que a abriu.
  useEffect(() => {
    if (wasCovered.current && !covered && pill.current) AccessibilityInfo.sendAccessibilityEvent(pill.current, "focus");
    wasCovered.current = covered;
  }, [covered]);

  const onChange = useCallback(
    (index: number) => {
      if (index < 0) return;
      // `selectionAsync` só quando o gesto encaixa num detent diferente (4.5 §2.6); a primeira leitura (abrir o app) não conta.
      const silent = skipHaptic.current;
      skipHaptic.current = false;
      if (!silent && lastIndex.current !== null && lastIndex.current !== index) void Haptics.selectionAsync();
      lastIndex.current = index;
      dispatch({ type: "setDetent", detent: detentFromIndex(index) });
    },
    [dispatch],
  );

  // Identidade estável: um `handleComponent` novo a cada troca de detent remonta o handle no fim do gesto.
  const Handle = useCallback(() => <HomeHandle onHeight={setHandleHeight} />, []);

  // D-145: fundo transparente (não de opacidade 0) que só recebe o toque com a folha no médio ou no grande (no pequeno, `disappearsOnIndex`
  // o deixa passar). O toque recolhe a folha e não chega ao que está embaixo. Sem texto de leitura: não é um controle.
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={1}
        disappearsOnIndex={0}
        // Opacidade 1 e fundo transparente: a vista com opacidade 0 não recebe toque no iOS (D-145, bloco 4).
        opacity={1}
        style={[props.style, { backgroundColor: "transparent" }]}
        pressBehavior={0}
        onPress={() => {
          skipHaptic.current = true;
        }}
        accessible={false}
        accessibilityRole={null}
        accessibilityLabel={null}
        accessibilityHint={null}
      />
    ),
    [],
  );

  // Altura da lista: a da folha aberta menos handle, cartão e pílula; igual em todos os detents.
  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      (detentMetrics(snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]?.scrollAreaHeight ?? 0) -
        pillHeight -
        effectiveCardHeight -
        space.md,
    ),
  );

  if (startIndex === null) return null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      accessibilityElementsHidden={covered}
      importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
    >
      <BottomSheet
        index={startIndex}
        animateOnMount={false}
        backdropComponent={renderBackdrop}
        snapPoints={snapPoints}
        animatedPosition={sheetTop}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        topInset={insets.top}
        onChange={onChange}
        handleComponent={Handle}
        style={elevation.sheet}
        backgroundStyle={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
      >
        {/* `View` comum, não `BottomSheetView`: ver `StackedSheet` (a lista perde a rolagem e o tamanho). */}
        <View style={styles.content} collapsable={false}>
          {tripCard || reminder ? (
            <View collapsable={false} onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)} style={styles.card}>
              {tripCard ? (
                <TripCard
                  card={tripCard}
                  onAlight={() => dispatch({ type: "push", sheet: { kind: "alight" } })}
                  onNotBoarded={() => notBoarded(tripCard)}
                  onDismiss={() => dismiss(tripCard)}
                  onOpenList={() => dispatch({ type: "push", sheet: { kind: "trip" } })}
                />
              ) : null}
              {reminder ? <BackupReminderCard text={reminder} onExport={backup.exportNow} onSnooze={backup.snooze} /> : null}
            </View>
          ) : null}
          <View collapsable={false} onLayout={(e) => setPillHeight(e.nativeEvent.layout.height)}>
            <SearchPill ref={pill} onPress={() => dispatch({ type: "push", sheet: { kind: "search" } })} />
          </View>
          {/* Lista com altura fixa (a da folha aberta); ver o registro E-02. No detent pequeno esta parte fica abaixo da
              borda da tela: fora da leitura do VoiceOver até a folha subir. */}
          <View
            collapsable={false}
            style={{ height: scrollAreaHeight, overflow: "hidden" }}
            accessibilityElementsHidden={state.detent === 0}
            importantForAccessibility={state.detent === 0 ? "no-hide-descendants" : "auto"}
          >
            <BottomSheetScrollView
              key={listReady ? "ready" : "loading"}
              contentContainerStyle={{ paddingTop: space.md, paddingBottom: insets.bottom + space.md }}
              showsVerticalScrollIndicator={false}
            >
              <NearbyStops />
              <HiddenBelowSpacer snapPoints={snapPoints} />
            </BottomSheetScrollView>
          </View>
        </View>
      </BottomSheet>
      {/* Botão flutuante (4.1 §4): acima do topo da folha, canto de baixo à direita, em qualquer detent. Depois da folha na
          ordem de desenho, para ficar por cima do fundo transparente do médio e do grande (D-145). */}
      <Animated.View pointerEvents="box-none" style={[styles.fab, fabStyle]}>
        <RegisterButton
          disabled={schedule.status !== "ready"}
          onPress={() => dispatch({ type: "push", sheet: { kind: "board", stopId: null } })}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: space.md },
  card: { paddingBottom: space.md, gap: space.sm },
  fab: { position: "absolute", top: 0, right: space.md },
});

/** Handle da folha inicial: o rótulo e o valor acompanham o detent; os ajustes do VoiceOver movem a folha. */
function HomeHandle({ onHeight }: { onHeight: (height: number) => void }) {
  const { state } = useSheets();
  const { snapToIndex } = useBottomSheet();
  return (
    <View collapsable={false} onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
      <SheetHandle
        kind="adjustable"
        detent={state.detent}
        onIncrement={() => snapToIndex(Math.min(state.detent + 1, LAST_INDEX))}
        onDecrement={() => snapToIndex(Math.max(state.detent - 1, 0))}
      />
    </View>
  );
}
