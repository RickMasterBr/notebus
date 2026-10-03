/**
 * TL-14 Busca (4.1 §15a; campo 4.4 §5.13, linha de lista §5.12, esqueleto §5.17).
 * Acha pontos por nome, apelido ou ID. Antes de digitar: nada. Só o grupo "Pontos": Linhas (E-08) e Lugares (E-05)
 * só entram quando o destino deles existir.
 */
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { searchStops } from "@notebus/domain";
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStopIndex } from "../data/StopIndexProvider";
import { stopIdDetail } from "../data/stopIdDetail";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph, SearchGlyph } from "../ui/Glyphs";
import { ListRow } from "../ui/ListRow";
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
  const keyboard = useKeyboardHeight();
  const input = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
  const [term, setTerm] = useState("");
  const [focused, setFocused] = useState(false);

  const typed = term.trim() !== "";
  const loading = index.status === "loading" && typed;
  const skeleton = useSkeletonVisible(loading);
  const results = useMemo(() => (index.status === "ready" ? searchStops(index.stops, term) : []), [index, term]);

  return (
    <StackedSheet tall>
      <View style={styles.fill}>
        <View style={[styles.field, { borderColor: focused ? colors.accent : colors.divider }]}>
          <SearchGlyph color={colors.textSecondary} />
          <BottomSheetTextInput
            ref={input}
            autoFocus
            value={term}
            onChangeText={setTerm}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
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
          contentContainerStyle={{ paddingBottom: Math.max(keyboard, insets.bottom) + space.md }}
        >
          {loading || skeleton ? (
            skeleton ? <Skeleton /> : null
          ) : results.length > 0 ? (
            <View>
              <Text accessibilityRole="header" style={[type.label, styles.group, { color: colors.textSecondary }]}>
                {t("search.group.stops")}
              </Text>
              {results.map((stop) => (
                <ListRow
                  key={stop.id}
                  title={stop.name}
                  detail={stopIdDetail(stop.externalId)}
                  secondary={stop.lines.join(", ")}
                  accessibilityLabel={
                    stop.lines.length > 0
                      ? t("search.result.stop.a11y", { name: stop.name, lines: stop.lines.join(", ") })
                      : stop.name
                  }
                  onPress={() => openStop({ id: stop.id, name: stop.name })}
                />
              ))}
            </View>
          ) : typed && index.status === "ready" ? (
            <Text style={[type.body, styles.empty, { color: colors.textSecondary }]}>
              {t("search.empty.no_results", { term: term.trim() })}
            </Text>
          ) : null}
        </BottomSheetScrollView>
      </View>
    </StackedSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // 5.13: `radius.sm`, `space.sm` interno, borda `divider` (foco: `accent` 1,5 px). Cresce com o Dynamic Type.
  field: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    marginBottom: space.sm,
  },
  input: { flex: 1, paddingVertical: space.sm },
  clear: { width: minTouch, height: minTouch, alignItems: "center", justifyContent: "center", marginRight: -space.sm },
  group: { paddingHorizontal: space.md, paddingVertical: space.sm },
  empty: { paddingHorizontal: space.md, paddingVertical: space.md },
});
