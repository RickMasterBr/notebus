/**
 * "Perto de você" (TL-01, detent médio; E-02 bloco 3c, Q-43/D-096): os últimos pontos abertos, mais recente primeiro,
 * cada um num cartão de ponto. Sem nenhum ponto aberto ainda: nada (só a pílula; texto de convite é questão aberta).
 * Esqueleto (D-127) enquanto a lista de pontos, os horários e os últimos pontos não chegam.
 */
import { type ReactNode, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRecentStops } from "../data/RecentStopsProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { type StopCard, buildStopCard } from "../data/stopCard";
import { useNowTick } from "../data/useNowTick";
import { t } from "../i18n";
import { space, type, useTheme } from "../theme";
import { Skeleton } from "../ui/Skeleton";
import { StopCardView } from "../ui/StopCardView";
import { useSkeletonVisible } from "../ui/useSkeletonVisible";
import { useOpenStop } from "./useOpenStop";

export function NearbyStops() {
  const stops = useStopIndex();
  const schedule = useSchedule();
  const recent = useRecentStops();
  const instant = useNowTick();
  const openStop = useOpenStop();

  const loading = stops.status === "loading" || schedule.status === "loading" || recent.status === "loading";
  const skeleton = useSkeletonVisible(loading);

  const cards = useMemo(
    () =>
      schedule.status === "ready"
        ? recent.ids.flatMap((id): StopCard[] => {
            const card = buildStopCard(id, schedule.data, instant);
            return card ? [card] : [];
          })
        : [],
    [schedule, recent.ids, instant],
  );

  if (loading || skeleton) return skeleton ? <Section><Skeleton variant="card" /></Section> : null;
  if (cards.length === 0) return null;

  return (
    <Section>
      {cards.map((card) => (
        <StopCardView key={card.stopId} card={card} onPress={() => openStop({ id: card.stopId, name: card.name })} />
      ))}
    </Section>
  );
}

function Section({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[type.label, { color: colors.textSecondary }]}>
        {t("home.section.nearby")}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
});
