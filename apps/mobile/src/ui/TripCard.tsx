/**
 * Cartão "Em viagem" (4.5 §2.4 D-042 e §2.5; canvas `Main.dc.html`; plano E-03 §4; D-073, D-075): fundo de destaque,
 * selo da linha, "Em viagem → {destino}", "embarcou 08:12 · Arrabalde da Ponte", a chegada prevista à direita, "Desci aqui"
 * em botão cheio e, ao lado, "Não embarquei" e "Dispensar" em texto (os dois com o mesmo estilo; Q-83, textos provisórios).
 *
 * Puxar o cartão para cima (ou tocar nele) abre a lista das paragens até o fim do percurso (`onOpenList`, só leitura).
 * Sem viagem conhecida (registro sem passagem e sem candidato): sem "→ destino", sem chegada e sem "Desci aqui" (a lista
 * da descida sairia vazia); "Não embarquei" e "Dispensar" continuam.
 * Desce 12 px e aparece em 250 ms; com "Reduzir movimento", só esmaece (4.5 §2.5).
 */
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, withTiming } from "react-native-reanimated";
import type { TripCardModel } from "../data/rideView";
import { t } from "../i18n";
import { motion, radius, space, type, useTheme } from "../theme";
import { useReduceMotion } from "../sheets/useReduceMotion";
import { LineBadge } from "./LineBadge";

const DROP = 12;
/** Quanto o dedo sobe, em px, para valer como "puxar o cartão". */
const PULL_PX = 40;

/** Entrada do canvas (`nb-drop`): desce 12 px e aparece, 250 ms. */
function dropIn() {
  "worklet";
  const timing = { duration: motion.normal, easing: Easing.out(Easing.ease) };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -DROP }] },
    animations: { opacity: withTiming(1, timing), transform: [{ translateY: withTiming(0, timing) }] },
  };
}

export function TripCard({
  card,
  onAlight,
  onNotBoarded,
  onDismiss,
  onOpenList,
}: {
  card: TripCardModel;
  onAlight: () => void;
  onNotBoarded: () => void;
  onDismiss: () => void;
  onOpenList: () => void;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const canList = !card.unmatched && card.ahead !== null;
  const pull = Gesture.Pan()
    .runOnJS(true)
    .enabled(canList)
    .activeOffsetY(-12)
    .failOffsetX([-24, 24])
    .onEnd((event) => {
      if (event.translationY <= -PULL_PX) onOpenList();
    });

  const title = card.unmatched
    ? t("trip_card.unmatched")
    : card.destination
      ? t("home.trip.title", { destination: card.destination })
      : t("home.trip.title_no_destination");
  const subtitle = t("home.trip.subtitle", { time: card.boardedTime, stop_name: card.stopName });
  const eta = card.eta ? `${card.eta.approximate ? "~" : ""}${card.eta.time}` : null;
  const nextText = card.unmatched ? card.unmatchedNext : null;
  const headLabel = [title, nextText, subtitle, eta ? t("home.trip.eta.a11y", { time: eta }) : null].filter(Boolean).join(", ");

  return (
    <Animated.View
      entering={reduceMotion ? FadeIn.duration(motion.normal) : dropIn}
      style={[styles.card, { backgroundColor: colors.trip }]}
    >
      <GestureDetector gesture={pull}>
        <Pressable
          accessibilityRole={canList ? "button" : "text"}
          accessibilityLabel={headLabel}
          accessibilityHint={canList ? t("home.trip.a11y.open_list") : undefined}
          disabled={!canList}
          onPress={onOpenList}
          style={styles.head}
        >
          {card.line ? <LineBadge code={card.line.code} color={card.line.color} /> : null}
          <View style={styles.titles}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>{title}</Text>
            {card.unmatched && card.unmatchedNext ? (
              <Text style={[type.caption, styles.num, { color: colors.tripText2 }]}>{card.unmatchedNext}</Text>
            ) : null}
            <Text style={[type.caption, styles.num, { color: colors.tripText2 }]}>{subtitle}</Text>
          </View>
          {eta ? <Text style={[styles.eta, { color: colors.text }]}>{eta}</Text> : null}
        </Pressable>
      </GestureDetector>
      <View style={styles.actions}>
        {card.trip && !card.unmatched ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAlight}
            style={({ pressed }) => [styles.alight, { backgroundColor: colors.accent }, pressed && styles.pressed]}
          >
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>{t("home.trip.alight_button")}</Text>
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}
        <TextAction label={t("home.trip.not_boarded_button")} color={colors.tripAccent} onPress={onNotBoarded} />
        <TextAction label={t("home.trip.dismiss_button")} color={colors.tripAccent} onPress={onDismiss} />
      </View>
    </Animated.View>
  );
}

/**
 * Lembrete de backup (D-088, plano E-03 §5.5): aviso discreto na folha inicial, abaixo do cartão "Em viagem". Sem
 * componente visual novo: a moldura e as ações em texto são as deste cartão, com o fundo neutro `fill` em vez do
 * destaque `trip` (o lembrete não compete com a viagem). "Exportar agora" abre o fluxo de exportar; "Agora não" esconde
 * por 2 dias. Nunca vira notificação.
 */
export function BackupReminderCard({ text, onExport, onSnooze }: { text: string; onExport: () => void; onSnooze: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.fill }]}>
      <Text style={[type.body, { color: colors.text }]}>{text}</Text>
      <View style={styles.actions}>
        <View style={styles.spacer} />
        <TextAction label={t("home.backup_reminder.export")} color={colors.accent} onPress={onExport} />
        <TextAction label={t("home.backup_reminder.snooze")} color={colors.textSecondary} onPress={onSnooze} />
      </View>
    </View>
  );
}

function TextAction({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
      <Text style={[type.subtitle, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Canvas: fundo `trip`, raio 14, padding 12 14, 12 de intervalo; botões de 44 px.
  card: { borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  titles: { flex: 1, gap: 2 },
  eta: { fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] },
  num: { fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm },
  alight: { flex: 1, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  spacer: { flex: 1 },
  textAction: { minHeight: 44, paddingHorizontal: 10, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
});
