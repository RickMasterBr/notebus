import { memo, useCallback, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { t } from "../i18n";
import { space, type, useTheme } from "../theme";
import { pressedStyle } from "../ui/pressed";

interface PendingSwipeRowProps {
  id: string;
  onDelete: (id: string) => void;
  onWillOpen: (methods: SwipeableMethods) => void;
  onClose: (methods: SwipeableMethods) => void;
  children: ReactNode;
}

/** Arrastar para a esquerda no cartão de Para conferir: mesma ação Apagar do registro avulso. */
export const PendingSwipeRow = memo(function PendingSwipeRow({
  id,
  onDelete,
  onWillOpen,
  onClose,
  children,
}: PendingSwipeRowProps) {
  const { colors } = useTheme();
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  const handleDeleteAction = useCallback(
    (methods: SwipeableMethods) => {
      methods.close();
      onDelete(id);
    },
    [id, onDelete],
  );

  const handleWillOpen = useCallback(() => {
    if (swipeableRef.current) onWillOpen(swipeableRef.current);
  }, [onWillOpen]);

  const handleSwipeClose = useCallback(() => {
    if (swipeableRef.current) onClose(swipeableRef.current);
  }, [onClose]);

  const renderRightActions = useCallback(
    (_progress: unknown, _translation: unknown, swipeableMethods: SwipeableMethods) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("sheet_records.action.delete")}
        onPress={() => handleDeleteAction(swipeableMethods)}
        style={({ pressed }) => [styles.deleteButton, { backgroundColor: colors.danger }, pressedStyle(pressed)]}
      >
        <Text style={[type.bodyStrong, { color: "#FFFFFF" }]}>
          {t("sheet_records.action.delete")}
        </Text>
      </Pressable>
    ),
    [colors.danger, handleDeleteAction],
  );

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
      {children}
    </ReanimatedSwipeable>
  );
});

const styles = StyleSheet.create({
  deleteButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    minHeight: 48,
    paddingHorizontal: space.sm,
  },
});
