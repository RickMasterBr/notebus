/**
 * Bloco da frase viva no Início (E-08.5 Bloco 17, 4.9 C, D-207 item 6, ideia 50).
 * Exibido no topo da HomeSheet entre os cartões e a pílula de busca.
 */
import { formatServiceMinute, lisbonWallClock } from "@notebus/domain";
import { StyleSheet, Text, View } from "react-native";
import { usePlaces } from "../data/PlacesProvider";
import type { HomePhrase as HomePhraseModel } from "../data/homePhrase";
import { t } from "../i18n";
import { space, type, useTheme } from "../theme";
import { LineBadge } from "./LineBadge";

export function HomePhrase({
  phrase,
  lineColor,
}: {
  phrase: HomePhraseModel;
  lineColor: string;
}) {
  const { colors } = useTheme();
  const { places } = usePlaces();

  const arriving = phrase.arriving;
  const place = arriving?.placeId ? places.find((p) => p.id === arriving.placeId) : null;
  const time = arriving
    ? formatServiceMinute(lisbonWallClock(arriving.beAtStopAt).minute)
    : "";

  const arrivingText = arriving
    ? place && place.name
      ? t("home.greeting.arriving.line", {
          place: place.name,
          stop: arriving.stopName,
          time,
        })
      : t("home.greeting.arriving.line_no_place", {
          stop: arriving.stopName,
          time,
        })
    : null;

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={t("home.greeting.a11y", {
        eyebrow: phrase.eyebrow,
        headline: phrase.headline,
      })}
      style={styles.container}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={styles.inner}
      >
        <Text style={[type.eyebrow, { color: colors.textSecondary }]}>{phrase.eyebrow}</Text>
        <Text numberOfLines={2} style={[type.phrase, { color: colors.text }]}>
          {phrase.headline}
        </Text>
        {phrase.arriving ? (
          <View style={styles.arrivingRow}>
            <LineBadge code={phrase.arriving.lineCode} color={lineColor} />
            <Text
              numberOfLines={1}
              style={[type.eyebrow, { color: colors.textSecondary }]}
            >
              {arrivingText}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  inner: {
    gap: space.xs,
  },
  arrivingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
});
