/**
 * TL-14 Busca (4.1 §15a; campo em pílula 4.4 §5.9/D-136, linha de lista §5.12, esqueleto §5.17).
 * Acha pontos por nome, apelido ou ID e linhas por código ou nome (Q-101; o toque numa linha abre o detalhe TL-11). Antes de digitar
 * (D-137): "Recentes" ou a mensagem de convite. Grupos "Pontos" e "Linhas"; Lugares (E-05) só entra quando o destino existir.
 * No modo `pick` só pontos. Linha não entra nos recentes (são de ponto).
 */
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { searchLines, searchStops } from "@notebus/domain";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRecentStops } from "../data/RecentStopsProvider";
import { useToast } from "../data/ToastProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { NEW_STOP_ID } from "../data/stopEdit";
import { searchEmpty } from "../data/emptyStates";
import { matchedAlias } from "../data/matchedAlias";
import { searchPanel } from "../data/searchPanel";
import { searchView } from "../data/searchResults";
import type { StopEntry } from "../data/stopIndex";
import { stopIdDetail } from "../data/stopIdDetail";
import { type NetworkLineItem, listLines } from "../db/networkList";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import { minTouch, opacity, space, type, useTheme } from "../theme";
import { EmptyState } from "../ui/EmptyState";
import { CrossGlyph, SearchGlyph } from "../ui/Glyphs";
import { LineBadge } from "../ui/LineBadge";
import { ListRow } from "../ui/ListRow";
import { pillStyles } from "../ui/SearchPill";
import { Skeleton } from "../ui/Skeleton";
import { useReorderTransition } from "../ui/useReorderTransition";
import { useSkeletonVisible } from "../ui/useSkeletonVisible";
import { useSheets, useStopPick } from "./SheetsContext";
import { StackedSheet, useCloseSheet } from "./StackedSheet";
import { useKeyboardHeight } from "./useKeyboardHeight";
import { useOpenStop } from "./useOpenStop";

export function SearchSheet({ id, pick = false }: { id: number; pick?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const openStop = useOpenStop();
  // `pick`: a folha Registrar pediu para escolher um ponto ("Trocar"); o toque devolve o ponto e fecha, sem abrir o ponto
  // nem entrar nos recentes.
  const stopPick = useStopPick();
  const { dispatch } = useSheets();
  const closeSheet = useCloseSheet();
  const toast = useToast();
  const index = useStopIndex();
  const recent = useRecentStops();
  const keyboard = useKeyboardHeight();
  const layout = useReorderTransition();
  const input = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
  const [term, setTerm] = useState("");
  const db = getSharedDb();
  const [lines, setLines] = useState<NetworkLineItem[]>([]);
  const [linesReady, setLinesReady] = useState(false);

  // As linhas só mudam pela Rede, que não abre por cima da Busca: carregar na abertura basta. Sem banco ou com erro, a Busca
  // segue só com pontos (nunca fica esperando as linhas).
  useEffect(() => {
    let active = true;
    if (!db) {
      setLines([]);
      setLinesReady(true);
      return;
    }
    listLines(db)
      .then((rows) => {
        if (active) setLines(rows);
      })
      .catch(() => {
        if (active) setLines([]);
      })
      .finally(() => {
        if (active) setLinesReady(true);
      });
    return () => {
      active = false;
    };
  }, [db]);

  const typed = term.trim() !== "";
  const loading = (index.status === "loading" && typed) || (!typed && (index.status === "loading" || recent.status === "loading"));
  const skeleton = useSkeletonVisible(loading);
  const results = useMemo(() => (index.status === "ready" ? searchStops(index.stops, term) : []), [index, term]);
  const recents = useMemo(() => {
    if (index.status !== "ready") return [];
    const byId = new Map(index.stops.map((s) => [s.id, s]));
    return recent.ids.flatMap((id) => byId.get(id) ?? []);
  }, [index, recent.ids]);
  const panel = searchPanel(term, recents.length);
  const lineResults = useMemo(() => searchLines(lines, term), [lines, term]);
  const view = searchView({
    term,
    recentCount: recents.length,
    pick,
    stopCount: results.length,
    lineCount: lineResults.length,
    linesReady,
  });
  const empty = searchEmpty({
    term,
    pick,
    stopTotal: index.status === "ready" ? index.stops.length : 0,
    recentCount: recents.length,
    showNoResults: view.showNoResults,
  });

  // A mensagem do vazio não é decorativa: o VoiceOver a lê uma vez, quando ela aparece.
  const announced = useRef(false);
  useEffect(() => {
    if (loading || (empty !== "prompt" && empty !== "prompt_pick" && panel !== "prompt") || announced.current) return;
    announced.current = true;
    AccessibilityInfo.announceForAccessibility(t("search.empty.prompt"));
  }, [loading, panel, empty]);

  const stopRow = (stop: StopEntry) => {
    // Só nos resultados da busca (não nos recentes) e só quando o termo casou com um apelido, não com o nome nem com o ID.
    const alias = panel === "results" ? matchedAlias(stop, term) : null;
    const aliasText = alias ? t("search.result.alias", { alias }) : undefined;
    const base =
      stop.lines.length > 0 ? t("search.result.stop.a11y", { name: stop.name, lines: stop.lines.join(", ") }) : stop.name;
    return (
    <ListRow
      key={stop.id}
      title={stop.name}
      detail={stopIdDetail(stop.externalId)}
      extra={aliasText}
      secondary={stop.lines.join(", ")}
      accessibilityLabel={aliasText ? `${base}, ${aliasText}` : base}
      onPress={() => {
        if (!pick) return openStop({ id: stop.id, name: stop.name });
        stopPick.resolve({ id: stop.id, name: stop.name });
        closeSheet();
      }}
    />
    );
  };

  // D-143: "Limpar" à direita do título "Recentes", sem confirmação; toast "Recentes limpos" com Desfazer. Só com recentes.
  const clearRecents = () => {
    const before = recent.clear();
    toast.show({
      title: t("toast.recents_cleared.title"),
      action: { label: t("toast.action.undo"), run: () => recent.restore(before) },
    });
  };
  // Só os recentes trocam de ordem (D-142); a lista de resultados muda por busca, não por reordenação.
  const group = (title: string, stops: StopEntry[], reorder = false) => (
    <View>
      <View style={styles.groupHeader}>
        <Text accessibilityRole="header" style={[type.label, styles.group, { color: colors.textSecondary }]}>
          {title}
        </Text>
        {reorder ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("search.recent.clear.a11y")}
            onPress={clearRecents}
            style={styles.clearRecents}
          >
            <Text style={[type.label, { color: colors.accent }]}>{t("search.recent.clear")}</Text>
          </Pressable>
        ) : null}
      </View>
      {reorder
        ? stops.map((stop) => (
            <Animated.View key={stop.id} layout={layout}>
              {stopRow(stop)}
            </Animated.View>
          ))
        : stops.map(stopRow)}
    </View>
  );

  const lineRow = (line: NetworkLineItem) => (
    <ListRow
      key={line.id}
      leading={<LineBadge code={line.code} color={line.color} />}
      title={line.name}
      accessibilityLabel={t("search.result.line.a11y", { code: line.code, name: line.name })}
      onPress={() => dispatch({ type: "push", sheet: { kind: "lineDetail", lineId: line.id } })}
    />
  );
  const lineGroup = (title: string, items: NetworkLineItem[]) => (
    <View>
      <Text accessibilityRole="header" style={[type.label, styles.group, { color: colors.textSecondary }]}>
        {title}
      </Text>
      {items.map(lineRow)}
    </View>
  );

  let body: ReactNode = null;
  if (loading || skeleton) {
    body = skeleton ? <Skeleton /> : null;
  } else if (panel === "recents") {
    body = group(t("search.group.recent"), recents, true);
  } else if (empty === "no_stops") {
    body = (
      <EmptyState
        icon={<SearchGlyph color={colors.accent} />}
        title={t("search.empty.no_stops.title")}
        body={t("search.empty.no_stops.body")}
        action={{
          label: t("stop_new.title"),
          onPress: () =>
            dispatch({
              type: "push",
              sheet: {
                kind: "stopEdit",
                stopId: NEW_STOP_ID,
                afterSave: pick ? "pick" : "open",
              },
            }),
        }}
      />
    );
  } else if (empty === "prompt") {
    body = (
      <Text accessible style={[type.body, styles.prompt, { color: colors.textSecondary, opacity: opacity.muted }]}>
        {t("search.empty.prompt")}
      </Text>
    );
  } else if (empty === "prompt_pick") {
    body = (
      <Text accessible style={[type.body, styles.prompt, { color: colors.textSecondary, opacity: opacity.muted }]}>
        {t("search.empty.prompt_pick")}
      </Text>
    );
  } else if (view.showStops || view.showLines) {
    body = (
      <View>
        {view.showStops ? group(t("search.group.stops"), results) : null}
        {view.showLines ? lineGroup(t("search.group.lines"), lineResults) : null}
      </View>
    );
  } else if (view.showNoResults && index.status === "ready") {
    body = (
      <EmptyState
        icon={<SearchGlyph color={colors.accent} />}
        title={t("search.no_results.title", { term: term.trim() })}
        body={t("search.no_results.body")}
        action={{
          label: t("search.no_results.create", { term: term.trim() }),
          onPress: () =>
            dispatch({
              type: "push",
              sheet: {
                kind: "stopEdit",
                stopId: NEW_STOP_ID,
                initialName: term.trim(),
                afterSave: pick ? "pick" : "open",
              },
            }),
        }}
        secondary={{
          label: t("search.no_results.clear"),
          onPress: () => {
            setTerm("");
            input.current?.focus();
          },
        }}
      />
    );
  }


  const isCentered = (empty !== null && empty !== "no_results") || empty === "no_results" || panel === "prompt";

  return (
    <StackedSheet id={id} tall>
      <View style={styles.fill}>
        {/* D-136: mesmo formato e mesma cor da pílula do Início (`pillStyles`). */}
        <View style={[pillStyles.pill, styles.field, { backgroundColor: colors.fill }]}>
          <SearchGlyph color={colors.textSecondary} />
          <BottomSheetTextInput
            ref={input}
            autoFocus
            value={term}
            onChangeText={setTerm}
            placeholder={t("home.search_placeholder")}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t("home.search_placeholder")}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={[type.body, styles.input, { color: colors.text }]}
          />
          {term !== "" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("search.clear.a11y")}
              hitSlop={space.xs}
              onPress={() => {
                setTerm("");
                input.current?.focus();
              }}
              style={styles.clear}
            >
              <CrossGlyph color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            { paddingBottom: Math.max(keyboard, insets.bottom) + space.md },
            isCentered && !loading ? styles.centered : null,
          ]}
        >
          {body}
        </BottomSheetScrollView>
      </View>
    </StackedSheet>
  );

}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // O formato vem de `pillStyles.pill`; aqui só o que é do campo: espaço até a lista e o campo de texto que cresce.
  field: { marginBottom: space.sm },
  input: { flex: 1, paddingVertical: space.sm },
  clear: { width: minTouch, height: minTouch, alignItems: "center", justifyContent: "center", marginRight: -space.sm },
  group: { paddingHorizontal: space.md, paddingVertical: space.sm },
  groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clearRecents: { minHeight: minTouch, paddingHorizontal: space.md, justifyContent: "center" },
  empty: { paddingHorizontal: space.md, paddingVertical: space.md },
  // Meio da área de resultados (a rolagem ocupa a folha toda; o conteúdo cresce até preencher e centraliza).
  centered: { flexGrow: 1, justifyContent: "center" },
  prompt: { textAlign: "center", paddingHorizontal: space.lg },
});
