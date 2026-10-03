/**
 * Cartão de ponto (canvas da 4.5, TL-01 "Seu ponto"; 4.4 §5.3 selo de linha; 4.5 §2.2 selo de confiança).
 * Nome do ponto; por linha: selo, "→ destino", "ônibus ~HH:MM · faixa", selo de confiança e, à direita,
 * "no ponto às HH:MM". Sem mais ônibus: o motivo e "próximo: dia, hora". Fica de fora o "sair de casa" (E-05).
 * O cartão é lido como um bloco (4.6 §5.2): ponto, depois cada linha.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NextBus, StopCard, StopCardLine } from "../data/stopCard";
import { busEtaText, cardA11y, directionText, nextDayText, reasonText } from "../data/stopCardText";
import { t } from "../i18n";
import { radius, space, type, useTheme } from "../theme";
import { ConfidenceSeal } from "./ConfidenceSeal";
import { LineBadge } from "./LineBadge";

export function StopCardView({ card, onPress }: { card: StopCard; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardA11y(card)}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { borderColor: colors.divider }, pressed && { opacity: 0.6 }]}
    >
      <Text style={[type.bodyStrong, { color: colors.text }]}>{card.name}</Text>
      {card.lines.map((line, i) => (
        <View key={line.code} style={[styles.line, i > 0 && [styles.separator, { borderTopColor: colors.divider }]]}>
          <LineRow line={line} />
        </View>
      ))}
    </Pressable>
  );
}

function LineRow({ line }: { line: StopCardLine }) {
  const { colors } = useTheme();
  const { state } = line;
  return (
    <View style={styles.row}>
      <LineBadge code={line.code} color={line.color} />
      <View style={styles.middle}>
        {line.destination ? (
          <Text style={[type.subtitle, { color: colors.text }]}>{directionText(line.destination)}</Text>
        ) : null}
        {state.status === "next" ? (
          <>
            <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>{busEtaText(state)}</Text>
            <ConfidenceSeal confidence={state.confidence} />
          </>
        ) : (
          <>
            {state.reason ? <Text style={[type.caption, { color: colors.textSecondary }]}>{reasonText(state.reason)}</Text> : null}
            {state.status === "later" ? (
              <Text style={[type.caption, styles.num, { color: colors.textSecondary }]}>{nextDayText(state)}</Text>
            ) : null}
          </>
        )}
      </View>
      {state.status === "next" ? (
        <View style={styles.right}>
          <Text style={[type.caption, { color: colors.textSecondary }]}>{t("home.stop_card.eta_label")}</Text>
          <Text style={[timeStyle(state.confidence), { color: strong(state.confidence) ? colors.text : colors.textSecondary }]}>
            {state.beAtStop}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Confiança alta ou média: horário em destaque (700); baixa ou só estimado: mais leve e em cinza (500). */
const strong = (confidence: NextBus["confidence"]) => confidence === "high" || confidence === "medium";
// Canvas: 28/700 em destaque; 22/500 quando só estimado (4.5 §2.2).
const timeStyle = (confidence: NextBus["confidence"]) =>
  strong(confidence) ? type.timeLg : ({ ...type.timeLg, fontSize: 22, fontWeight: "500" } as const);

const styles = StyleSheet.create({
  // Canvas: borda `divider` de 1 px, raio 14, padding 12 × 14, 10 de intervalo entre as partes.
  card: { borderWidth: 1, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  line: { gap: 10 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  middle: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end" },
  num: { fontVariant: ["tabular-nums"] },
});
