/**
 * TL-14 Busca (4.1 §15a; campo em pílula 4.4 §5.9/D-136, linha de lista §5.12, esqueleto §5.17).
 * Acha pontos por nome, apelido ou ID. Antes de digitar (D-137): "Recentes" ou a mensagem de convite. Só o grupo "Pontos": Linhas (E-08) e Lugares (E-05)
 * só entram quando o destino deles existir.
 */
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { searchStops } from "@notebus/domain";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRecentStops } from "../data/RecentStopsProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { searchPanel } from "../data/searchPanel";
import type { StopEntry } from "../data/stopIndex";
import { stopIdDetail } from "../data/stopIdDetail";
import { t } from "../i18n";
import { minTouch, opacity, space, type, useTheme } from "../theme";
import { CrossGlyph, SearchGlyph } from "../ui/Glyphs";
import { ListRow } from "../ui/ListRow";
import { pillStyles } from "../ui/SearchPill";
import { Skeleton } from "../ui/Skeleton";
import { useSkeletonVisible } from "../ui/useSkeletonVisible";
import { StackedSheet } from "./StackedSheet";
import { useKeyboardHeight } from "./useKeyboardHeight";
import { useOpenStop } from "./useOpenStop";

export function SearchSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const openStop = useOpenStop();
  const index = useStopIndex();
  const recent = useRecentStops();
  const keyboard = useKeyboardHeight();
  const input = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
  const [term, setTerm] = useState("");

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

  // A mensagem do vazio não é decorativa: o VoiceOver a lê uma vez, quando ela aparece.
  const announced = useRef(false);
  useEffect(() => {
    if (loading || panel !== "prompt" || announced.current) return;
    announced.current = true;
    AccessibilityInfo.announceForAccessibility(t("search.empty.prompt"));
  }, [loading, panel]);

  const stopRow = (stop: StopEntry) => (
    <ListRow
      key={stop.id}
      title={stop.name}
      detail={stopIdDetail(stop.externalId)}
      secondary={stop.lines.join(", ")}
      accessibilityLabel={
        stop.lines.length > 0 ? t("search.result.stop.a11y", { name: stop.name, lines: stop.lines.join(", ") }) : stop.name
      }
      onPress={() => openStop({ id: stop.id, name: stop.name })}
    />
  );
  const group = (title: string, stops: StopEntry[]) => (
    <View>
      <Text accessibilityRole="header" style={[type.label, styles.group, { color: colors.textSecondary }]}>
        {title}
      </Text>
      {stops.map(stopRow)}
    </View>
  );

  let body: ReactNode = null;
  if (loading || skeleton) body = skeleton ? <Skeleton /> : null;
  else if (panel === "recents") body = group(t("search.group.recent"), recents);
  else if (panel === "prompt")
    body = (
      <Text accessible style={[type.body, styles.prompt, { color: colors.textSecondary, opacity: opacity.muted }]}>
        {t("search.empty.prompt")}
      </Text>
    );
  else if (results.length > 0) body = group(t("search.group.stops"), results);
  else if (index.status === "ready")
    body = (
      <Text style={[type.body, styles.empty, { color: colors.textSecondary }]}>
        {t("search.empty.no_results", { term: term.trim() })}
      </Text>
    );

  return (
    <StackedSheet tall>
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
            panel === "prompt" && !loading ? styles.centered : null,
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
  empty: { paddingHorizontal: space.md, paddingVertical: space.md },
  // Meio da área de resultados (a rolagem ocupa a folha toda; o conteúdo cresce até preencher e centraliza).
  centered: { flexGrow: 1, justifyContent: "center" },
  prompt: { textAlign: "center", paddingHorizontal: space.lg },
});
