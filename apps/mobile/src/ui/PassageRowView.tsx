/**
 * Uma passagem na lista do ponto (TL-02; canvas da 4.5, Main.dc.html; 4.1 §5; 4.4 §5.12 e §5.10):
 * `~08:13 · 08:09–08:18 · confiança`. A **próxima** da linha ganha o fundo `highlight` e o "no ponto às" grande, como
 * o cartão de ponto; as outras são linhas simples com separador. Abaixo do horário, as frases de apoio (começa aqui,
 * 2ª passagem · veio…, fim do percurso). Tocar num horário não faz nada nesta etapa (a TL-05 é do bloco 5): a linha
 * não é um botão, não tem seta nem estado de pressionada. Lida como um bloco pelo VoiceOver.
 */
import { StyleSheet, Text, View } from "react-native";
import type { DayLine, PassageRow } from "../data/stopDay";
import { mayPassNowText } from "../data/stopCardText";
import { passageNotes, rowA11y, rowRangeText, rowTimeText } from "../data/stopDayText";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ConfidenceSeal } from "./ConfidenceSeal";

/** Confiança alta ou média: horário em destaque (600); baixa ou só estimado: mais leve e em cinza (500). */
const strong = (confidence: PassageRow["confidence"]) => confidence === "high" || confidence === "medium";

export function PassageRowView({ line, row, last }: { line: Pick<DayLine, "code">; row: PassageRow; last: boolean }) {
  const { colors } = useTheme();
  const notes = passageNotes(row);
  const timeColor = strong(row.confidence) ? colors.text : colors.textSecondary;
  const showMayPass = row.mayPassNow;

  if (row.isNext) {
    return (
      <View accessible accessibilityLabel={rowA11y(line, row)} style={[styles.next, { backgroundColor: colors.highlight }]}>
        <View style={styles.middle}>
          <Text style={[type.timeMd, { color: colors.text }]}>{rowTimeText(row)}</Text>
          <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>{rowRangeText(row)}</Text>
          <ConfidenceSeal confidence={row.confidence} />
          {notes.map((note) => (
            <Text key={note} style={[type.caption, { color: colors.textSecondary }]}>{note}</Text>
          ))}
          {showMayPass ? <Text style={[type.label, { color: colors.text }]}>{mayPassNowText(row.rangeEnd)}</Text> : null}
        </View>
        {showMayPass ? null : (
          <View style={styles.right}>
            <Text style={[type.caption, { color: colors.textSecondary }]}>{t("home.stop_card.eta_label")}</Text>
            <Text style={[strong(row.confidence) ? type.timeLg : weak, { color: timeColor }]}>{row.beAtStop}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={rowA11y(line, row)}
      style={[styles.row, !last && { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      <View style={styles.middle}>
        <Text style={[type.timeMd, { color: timeColor, fontWeight: strong(row.confidence) ? "600" : "500" }]}>{rowTimeText(row)}</Text>
        {notes.map((note) => (
          <Text key={note} style={[type.caption, { color: colors.textSecondary }]}>{note}</Text>
        ))}
        {showMayPass ? <Text style={[type.label, { color: colors.text }]}>{mayPassNowText(row.rangeEnd)}</Text> : null}
      </View>
      <View style={styles.right}>
        <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>{rowRangeText(row)}</Text>
        <ConfidenceSeal confidence={row.confidence} />
      </View>
    </View>
  );
}

// Canvas: 22/500 quando só estimado (4.5 §2.2), como no cartão de ponto.
const weak = { ...type.timeLg, fontSize: 22, fontWeight: "500" } as const;

const styles = StyleSheet.create({
  // Canvas: bloco de raio 14, padding 12 × 14, 12 de intervalo.
  next: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  row: { minHeight: minTouch, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, paddingVertical: space.sm },
  middle: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end", gap: 2 },
  num: { fontVariant: ["tabular-nums"] },
});
