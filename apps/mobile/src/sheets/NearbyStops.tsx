/**
 * "Perto de você" (TL-01, detent médio; E-02 bloco 3c, Q-43/D-096): os 3 últimos pontos abertos (de até 10 guardados, D-144), mais recente primeiro,
 * cada um num cartão de ponto. Sem nenhum ponto aberto ainda: nada (só a pílula; texto de convite é questão aberta).
 * Esqueleto (D-127) enquanto a lista de pontos, os horários e os últimos pontos não chegam.
 */
import { type ReactNode, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { usePlaces } from "../data/PlacesProvider";
import { useRecentStops } from "../data/RecentStopsProvider";
import { useRegistro } from "../data/RegistroProvider";
import { useSchedule } from "../data/ScheduleProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { nearbyIds } from "../data/homeStart";
import { realNow } from "../data/clock";
import { nearbyStopIdsByFix } from "../data/nearbyByFix";
import { useLastFix } from "../data/PositionProvider";
import { useStopLocations } from "../data/StopLocationsProvider";
import { type StopCard, buildStopCard } from "../data/stopCard";
import { stopCardLeaveAtSubtitle } from "../data/stopCardLeaveAt";
import { useNowTick } from "../data/useNowTick";
import { t } from "../i18n";
import { space, type, useTheme } from "../theme";
import { Skeleton } from "../ui/Skeleton";
import { StopCardView } from "../ui/StopCardView";
import { useReorderTransition } from "../ui/useReorderTransition";
import { useSkeletonVisible } from "../ui/useSkeletonVisible";
import { useOpenStop } from "./useOpenStop";

export function NearbyStops() {
  const stops = useStopIndex();
  const schedule = useSchedule();
  const recent = useRecentStops();
  const places = usePlaces();
  const registro = useRegistro();
  const instant = useNowTick();
  const openStop = useOpenStop();
  const layout = useReorderTransition();

  const loading = stops.status === "loading" || schedule.status === "loading" || recent.status === "loading";
  const skeleton = useSkeletonVisible(loading);

  const fix = useLastFix();
  const locations = useStopLocations();
  // Pela posição quando há pontos perto (plano §3.4); senão a regra provisória da E-02, sem mudança. Pode reordenar com o tique.
  const ids = useMemo(() => {
    const byFix = nearbyStopIdsByFix(fix, realNow(), locations.stops);
    return byFix.length > 0 ? byFix : nearbyIds(recent.ids);
  }, [fix, locations.stops, recent.ids, instant]);

  const cards = useMemo(
    () =>
      schedule.status === "ready"
        ? ids.flatMap((id): StopCard[] => {
            const card = buildStopCard(id, schedule.data, instant);
            return card ? [card] : [];
          })
        : [],
    [schedule, ids, instant],
  );

  if (loading || skeleton) return skeleton ? <Section><Skeleton variant="card" /></Section> : null;
  if (cards.length === 0) return null;

  return (
    <Section>
      {cards.map((card) => {
        const subtitle = stopCardLeaveAtSubtitle({
          stopId: card.stopId,
          places: places.places,
          routes: places.routes,
          options: places.options,
          walkTimes: places.walkTimes,
          observations: registro.observations,
          rides: registro.rides,
          schedule: schedule.status === "ready" ? schedule.data : null,
          now: instant,
        });
        return (
          // D-142: ao abrir um ponto, o cartão sobe e os outros descem com transição de layout.
          <Animated.View key={card.stopId} layout={layout}>
            <StopCardView
              card={card}
              subtitle={subtitle}
              onPress={() => openStop({ id: card.stopId, name: card.name })}
            />
          </Animated.View>
        );
      })}
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
