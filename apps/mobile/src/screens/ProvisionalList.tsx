/**
 * Lista provisória (E-01 bloco 4b), jogada fora na E-02: linhas → percursos → viagens → paragens com horário.
 * Serve para conferir a importação contra o site da MOBILIS. Sem especificação própria: só selo de linha (§5.3),
 * linha de lista (§5.12) e tokens, texto simples.
 */
import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatServiceMinute } from "@notebus/domain";
import {
  type LineItem, type PatternItem, type TripItem, type TripTime,
  listLines, listPatterns, listTrips, listTripTimes,
} from "../db/provisional";
import { t } from "../i18n";
import { EmptyHome } from "./EmptyHome";
import { space, type, useTheme } from "../theme";
import { LineBadge } from "../ui/LineBadge";
import { ListRow } from "../ui/ListRow";

type Db = Parameters<typeof listLines>[0];

type Step =
  | { kind: "lines" }
  | { kind: "patterns"; line: LineItem }
  | { kind: "trips"; line: LineItem; pattern: PatternItem }
  | { kind: "times"; line: LineItem; pattern: PatternItem; trip: TripItem };

function useLoad<T>(load: () => Promise<T>, deps: unknown[]): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    setValue(null);
    load().then((v) => alive && setValue(v));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function ProvisionalList({ db }: { db: Db }) {
  const { colors } = useTheme();
  const [stack, setStack] = useState<Step[]>([{ kind: "lines" }]);
  const step = stack[stack.length - 1]!;
  const push = (s: Step) => setStack([...stack, s]);
  const back = () => setStack(stack.slice(0, -1));

  const lines = useLoad(() => listLines(db), []);

  const patterns = useLoad(() => (step.kind === "patterns" ? listPatterns(db, step.line.id) : Promise.resolve(null)), [step]);
  const trips = useLoad(() => (step.kind === "trips" ? listTrips(db, step.pattern.id) : Promise.resolve(null)), [step]);
  const times = useLoad<TripTime[] | null>(() => (step.kind === "times" ? listTripTimes(db, step.trip.id) : Promise.resolve(null)), [step]);

  const heading =
    step.kind === "lines" ? null
    : step.kind === "patterns" ? step.line.name
    : step.kind === "trips" ? step.pattern.label
    : formatServiceMinute(step.trip.firstMinute);
  const previous =
    step.kind === "patterns" ? null
    : step.kind === "trips" ? step.line.name
    : step.kind === "times" ? step.pattern.label
    : null;

  // "Começar do zero" (ou nada importado): Início vazio, em vez de uma lista vazia (4.1 §11).
  if (lines && lines.length === 0) return <EmptyHome />;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      {step.kind !== "lines" ? (
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={back} hitSlop={space.sm}>
            <Text style={[type.bodyStrong, { color: colors.accent }]}>{previous ? `‹ ${previous}` : "‹"}</Text>
          </Pressable>
          <Text style={[type.title, { color: colors.text }]}>{heading}</Text>
        </View>
      ) : null}
      <ScrollView style={{ backgroundColor: colors.surface }}>
        {step.kind === "lines" &&
          lines?.map((l) => (
            <ListRow key={l.id} leading={<LineBadge code={l.code} color={l.color} />} title={l.name} onPress={() => push({ kind: "patterns", line: l })} />
          ))}
        {step.kind === "patterns" &&
          patterns?.map((p) => <ListRow key={p.id} title={p.label} onPress={() => push({ kind: "trips", line: step.line, pattern: p })} />)}
        {step.kind === "trips" &&
          trips?.map((tr) => (
            <ListRow
              key={tr.id}
              title={formatServiceMinute(tr.firstMinute)}
              secondary={tr.dayTypes.map((d) => t(`common.day_type.${d}`)).join(" · ")}
              onPress={() => push({ kind: "times", line: step.line, pattern: step.pattern, trip: tr })}
            />
          ))}
        {step.kind === "times" &&
          times?.map((x) => <ListRow key={x.position} title={x.stopName} secondary={formatServiceMinute(x.minute)} />)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { padding: space.md, gap: space.xs },
});
