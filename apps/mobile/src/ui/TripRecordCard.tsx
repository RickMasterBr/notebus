import { memo, useCallback, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import type { TripCardModel } from "../data/recordsTrips";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ChevronRightGlyph, InfoGlyph } from "./Glyphs";
import { LineBadge } from "./LineBadge";
import { pressedStyle } from "./pressed";
import { hitSlopToMinTouch } from "./touch";

export interface TripRecordCardProps {
  card: TripCardModel;
  askAlight?: boolean;
  isNow?: boolean;
  onPress: (card: TripCardModel) => void;
  onAskAlight?: (card: TripCardModel) => void;
  onDelete?: (boardingId: string, alightingId: string | null) => void;
  onWillOpen?: (methods: SwipeableMethods) => void;
  onClose?: (methods: SwipeableMethods) => void;
}

export const TripRecordCard = memo(function TripRecordCard({
  card,
  askAlight = false,
  isNow = false,
  onPress,
  onAskAlight,
  onDelete,
  onWillOpen,
  onClose,
}: TripRecordCardProps) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  const handleCardPress = useCallback(() => {
    onPress(card);
  }, [card, onPress]);

  const handleAskAlightPress = useCallback(() => {
    if (onAskAlight) onAskAlight(card);
    else onPress(card);
  }, [card, onAskAlight, onPress]);

  const handleDeleteAction = useCallback(
    (methods: SwipeableMethods) => {
      methods.close();
      onDelete?.(card.boardingId, card.alightingId);
    },
    [card.boardingId, card.alightingId, onDelete],
  );

  const handleAccessibilityDelete = useCallback(() => {
    swipeableRef.current?.close();
    onDelete?.(card.boardingId, card.alightingId);
  }, [card.boardingId, card.alightingId, onDelete]);

  const handleWillOpen = useCallback(() => {
    if (swipeableRef.current && onWillOpen) {
      onWillOpen(swipeableRef.current);
    }
  }, [onWillOpen]);

  const handleSwipeClose = useCallback(() => {
    if (swipeableRef.current && onClose) {
      onClose(swipeableRef.current);
    }
  }, [onClose]);

  const renderRightActions = useCallback(
    (
      _progress: unknown,
      _translation: unknown,
      swipeableMethods: SwipeableMethods,
    ) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("sheet_records.action.delete")}
        onPress={() => handleDeleteAction(swipeableMethods)}
        style={({ pressed }) => [
          styles.deleteButton,
          { backgroundColor: colors.danger },
          pressedStyle(pressed),
        ]}
      >
        <Text style={[type.bodyStrong, { color: "#FFFFFF" }]}>
          {t("sheet_records.action.delete")}
        </Text>
      </Pressable>
    ),
    [colors.danger, handleDeleteAction],
  );

  const routeText =
    card.toName != null
      ? t("sheet_records.trip.route", { from: card.fromName, to: card.toName })
      : t("sheet_records.trip.route_unknown", { from: card.fromName });

  const hasDelete = Boolean(!isNow && onDelete);

  const cardContent = (
    <Pressable
      accessibilityRole="button"
      accessibilityActions={hasDelete ? [{ name: "delete", label: t("sheet_records.action.delete") }] : undefined}
      onAccessibilityAction={(event) => {
        if (hasDelete && event.nativeEvent.actionName === "delete") {
          handleAccessibilityDelete();
        }
      }}
      accessibilityLabel={card.a11y}
      onPress={handleCardPress}
      style={({ pressed }) => [
        styles.tripCardContainer,
        {
          backgroundColor: isNow ? colors.highlight : colors.surface,
          borderColor: isNow ? colors.accent : colors.divider,
        },
        pressedStyle(pressed),
      ]}
    >
      <View style={styles.tripCardRow}>
        <LineBadge code={card.line.code} color={card.line.color} />
        <View style={styles.tripCardMain}>
          <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {routeText}
          </Text>
          <Text style={[type.body, styles.timeText, { color: colors.text }]}>
            {card.timeText}
          </Text>
          {card.deltaText != null && (
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {card.deltaText}
            </Text>
          )}
          {card.noAlight && (
            askAlight ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("records.no_alight.ask")}
                hitSlop={hitSlopToMinTouch(20)}
                onPress={handleAskAlightPress}
                style={({ pressed }) => [styles.askAlightButton, pressedStyle(pressed)]}
              >
                <Text style={[type.caption, { color: colors.accent, fontWeight: "600" }]}>
                  {t("records.no_alight.ask")}
                </Text>
              </Pressable>
            ) : (
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("sheet_records.trip.no_alight")}
              </Text>
            )
          )}
        </View>

        <View style={styles.tripCardRight}>
          {isNow ? (
            <View style={[styles.chip, { backgroundColor: colors.highlight, borderColor: colors.accent }]}>
              <Text style={[type.caption, { color: colors.accent, fontWeight: "600" }]}>
                {t("sheet_records.now.badge")}
              </Text>
            </View>
          ) : card.verifyState === "pending" ? (
            <View style={[styles.chip, { borderColor: colors.accent }]}>
              <InfoGlyph color={colors.accent} />
              <Text style={[type.caption, { color: colors.accent }]}>
                {t("sheet_records.chip.pending")}
              </Text>
            </View>
          ) : card.verifyState === "notVerified" ? (
            <View style={[styles.chip, { borderColor: colors.textSecondary }]}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {t("sheet_records.chip.not_verified")}
              </Text>
            </View>
          ) : (
            <ChevronRightGlyph color={colors.textSecondary} />
          )}
        </View>
      </View>
    </Pressable>
  );

  if (isNow || !onDelete) {
    return cardContent;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      enableTrackpadTwoFingerGesture
      rightThreshold={40}
      renderRightActions={renderRightActions}
      overshootRight={false}
      onSwipeableWillOpen={handleWillOpen}
      onSwipeableClose={handleSwipeClose}
    >
      {cardContent}
    </ReanimatedSwipeable>
  );
});

const styles = StyleSheet.create({
  tripCardContainer: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    minHeight: minTouch,
  },
  tripCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  tripCardMain: {
    flex: 1,
    gap: 2,
  },
  tripCardRight: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  timeText: {
    fontVariant: ["tabular-nums"],
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  deleteButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    minHeight: 48,
    paddingHorizontal: space.sm,
  },
  askAlightButton: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
});
