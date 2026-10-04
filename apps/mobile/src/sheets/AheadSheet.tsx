/**
 * TL-05 Daqui para a frente (4.1 TL-05, 4.4 §5.1 e §5.17, canvas da 4.5: `Terminal.dc.html`, folha "Daqui para a frente";
 * plano E-02 §4.3; 4.6 §3.9 e §5.2): as próximas paragens de uma viagem a partir da passagem tocada, com o horário
 * esperado e o "↺ volta aqui" onde o percurso repete o ponto físico. Resposta a "está indo ou voltando?" (UC-16).
 *
 * Folha empilhada de uma altura (como a Busca) por cima do Ponto, com ✕ "Fechar" (D-135) e fundo escurecido. Rola com
 * `BottomSheetScrollView`, numa `View` comum (ver `StackedSheet`), e **não** desliga o gesto de conteúdo (só o Ponto).
 * Ordem de leitura do VoiceOver: título, contexto, frase-resumo e, por fim, cada paragem como um bloco (D-047).
 * Dynamic Type acima de `.xxLarge`: hora e nome empilham por paragem (4.6 §6). Sem lugares do usuário (E-05).
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSchedule } from "../data/ScheduleProvider";
import { type Ahead, type AheadStopRow, type TimelineItem, buildAhead, timelineItems } from "../data/ahead";
import {
  boldSegments,
  contextText,
  gapText,
  returnTag,
  stopA11y,
  stopTimeText,
  summaryPlain,
  summaryText,
} from "../data/aheadText";
import { t } from "../i18n";
import { type ColorTokens, radius, space, type, useTheme } from "../theme";
import { LineBadge } from "../ui/LineBadge";
import { Skeleton } from "../ui/Skeleton";
import { useSkeletonVisible } from "../ui/useSkeletonVisible";
import { StackedSheet } from "./StackedSheet";

/** Canvas: hora de 48 px, ponto de 14, trilho de 4; o trilho passa pelo centro da coluna do ponto. */
const TIME_WIDTH = 48;
const DOT_COLUMN = 20;
const GAP = 12;
const RAIL = 4;
/** Acima de `.xxLarge` (≈ 1,24× o texto) a hora e o nome não cabem lado a lado (4.6 §6). */
const STACK_FONT_SCALE = 1.25;

export function AheadSheet({ id, tripId, position }: { id: number; tripId: string; position: number }) {
  const insets = useSafeAreaInsets();
  const schedule = useSchedule();
  const loading = schedule.status === "loading";
  const skeleton = useSkeletonVisible(loading);
  const ahead = schedule.status === "ready" ? buildAhead(tripId, position, schedule.data) : null;

  return (
    <StackedSheet id={id} tall>
      <BottomSheetScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.md, gap: space.md }}
        showsVerticalScrollIndicator={false}
      >
        {loading || skeleton ? (
          skeleton ? <Skeleton rows={6} /> : null
        ) : (
          <>
            <Header ahead={ahead} />
            {ahead ? <Body ahead={ahead} /> : null}
          </>
        )}
      </BottomSheetScrollView>
    </StackedSheet>
  );
}

/** Selo da linha + "Daqui para a frente", e o contexto ("viagem das 08:10 · Estádio, 2ª passagem"). */
function Header({ ahead }: { ahead: Ahead | null }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        {ahead?.line ? <LineBadge code={ahead.line.code} color={ahead.line.color} /> : null}
        <Text accessibilityRole="header" style={[type.title, styles.title, { color: colors.text }]}>
          {t("terminal_detail.title")}
        </Text>
      </View>
      {ahead ? <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>{contextText(ahead)}</Text> : null}
    </View>
  );
}

function Body({ ahead }: { ahead: Ahead }) {
  const { colors } = useTheme();
  const summary = summaryText(ahead);
  return (
    <>
      {ahead.isFirst && ahead.nextTimepoints[0] ? (
        <Text style={[type.caption, { color: colors.textSecondary }]}>
          {t("terminal.trip.starts_here", { place: ahead.nextTimepoints[0].name, time: ahead.nextTimepoints[0].time })}
        </Text>
      ) : null}

      {summary ? (
        <View accessible accessibilityLabel={summaryPlain(summary)} style={[styles.summary, { backgroundColor: colors.highlight }]}>
          <Text style={[type.body, styles.summaryText, { color: colors.text }]}>
            {boldSegments(summary).map((segment, i) => (
              <Text key={i} style={segment.bold ? styles.bold : undefined}>
                {segment.text}
              </Text>
            ))}
          </Text>
        </View>
      ) : null}

      {ahead.isLast ? (
        // A viagem termina aqui: não há "daqui para a frente" (plano §3.6). O aviso fica na cor de aviso (D-041).
        <View accessible style={styles.ends}>
          <Text style={[type.bodyStrong, { color: colors.textSecondary }]}>{t("terminal.trip.ends_here")}</Text>
          <Text style={[type.label, { color: colors.warning }]}>{t("sheet_stop.end_of_route")}</Text>
        </View>
      ) : (
        <Timeline ahead={ahead} lineColor={ahead.line?.color ?? colors.accent} />
      )}

      {ahead.isLast ? null : (
        <Text style={[type.caption, { color: colors.textSecondary }]}>{t("terminal_detail.footnote")}</Text>
      )}
    </>
  );
}

/** A linha do tempo: "você", as paragens (ou "+ N paragens") e o trilho na cor da linha. */
function Timeline({ ahead, lineColor }: { ahead: Ahead; lineColor: string }) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_FONT_SCALE;
  const items: TimelineItem[] = [{ kind: "stop", row: ahead.here }, ...timelineItems(ahead.stops)];
  const railLeft = (stacked ? 0 : TIME_WIDTH + GAP) + (DOT_COLUMN - RAIL) / 2;
  return (
    <View style={styles.timeline}>
      <View style={[styles.rail, { left: railLeft, backgroundColor: lineColor }]} />
      {items.map((item, i) =>
        item.kind === "gap" ? (
          <GapRow key={`gap-${i}`} count={item.count} stacked={stacked} />
        ) : (
          <StopRow key={item.row.position} row={item.row} isHere={item.row === ahead.here} lineColor={lineColor} stacked={stacked} />
        ),
      )}
    </View>
  );
}

function StopRow({ row, isHere, lineColor, stacked }: { row: AheadStopRow; isHere: boolean; lineColor: string; stacked: boolean }) {
  const { colors } = useTheme();
  const tag = isHere ? t("terminal_detail.you_are_here") : returnTag(row);
  const strong = isHere || row.isTimepoint || row.returnsHere;
  const time = (
    <Text style={[type.timeMd, styles.time, { color: colors.text, fontWeight: isHere || row.isTimepoint ? "700" : "500" }]}>
      {stopTimeText(row)}
    </Text>
  );
  const name = (
    <Text style={[styles.name, { color: colors.text, fontWeight: strong ? "600" : "400" }]}>{row.name}</Text>
  );
  const dot = (
    <View style={styles.dotColumn}>
      <View
        style={[
          styles.dot,
          { backgroundColor: isHere ? colors.accent : colors.surface, borderColor: isHere ? colors.accent : lineColor },
        ]}
      />
    </View>
  );
  const pill = tag ? <Tag text={tag} isHere={isHere} colors={colors} /> : null;
  return (
    <View accessible accessibilityLabel={stopA11y(row, isHere)} style={styles.row}>
      {stacked ? (
        <>
          {dot}
          <View style={styles.stackedText}>
            {time}
            {name}
          </View>
          {pill}
        </>
      ) : (
        <>
          {time}
          {dot}
          {name}
          {pill}
        </>
      )}
    </View>
  );
}

function Tag({ text, isHere, colors }: { text: string; isHere: boolean; colors: ColorTokens }) {
  return (
    <View style={[styles.tag, { backgroundColor: isHere ? colors.accent : colors.fill }]}>
      <Text style={[type.label, styles.tagText, { color: isHere ? colors.onAccent : colors.text }]}>{text}</Text>
    </View>
  );
}

function GapRow({ count, stacked }: { count: number; stacked: boolean }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={gapText(count)} style={styles.row}>
      {stacked ? null : <View style={{ width: TIME_WIDTH }} />}
      <View style={styles.dotColumn} />
      <Text style={[styles.name, { color: colors.textSecondary }]}>{gapText(count)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 22 },
  num: { fontVariant: ["tabular-nums"] },
  // Canvas: bloco de raio 14, padding 12 × 14, 16 com entrelinha de 1,4.
  summary: { borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  summaryText: { lineHeight: 22 },
  bold: { fontWeight: "700" },
  ends: { gap: 2, paddingVertical: space.xs },
  timeline: { position: "relative" },
  rail: { position: "absolute", top: 18, bottom: 18, width: RAIL, borderRadius: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: GAP, minHeight: 38 },
  time: { width: TIME_WIDTH },
  dotColumn: { width: DOT_COLUMN, alignItems: "center" },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  name: { flex: 1, fontSize: 15 },
  stackedText: { flex: 1, gap: 2 },
  tag: { borderRadius: radius.full, paddingVertical: 5, paddingHorizontal: 12 },
  tagText: { fontSize: 14 },
});
