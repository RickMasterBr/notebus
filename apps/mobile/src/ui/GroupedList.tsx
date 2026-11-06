import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ChevronRightGlyph } from "./Glyphs";
import { NbSwitch } from "./NbSwitch";
import {
  type GroupedRowAccessory,
  groupedRowValueBelow,
} from "./componentRules";
import { pressedStyle } from "./pressed";

export interface GroupedListProps {
  title?: string;
  footer?: string;
  children: ReactNode;
}

export function GroupedList({ title, footer, children }: GroupedListProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.group}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={[styles.header, type.caption, { color: colors.textSecondary }]}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={[
          styles.block,
          {
            backgroundColor: colors.surface,
            borderColor: colors.divider,
            borderRadius: radius.md,
          },
        ]}
      >
        {children}
      </View>
      {footer ? (
        <Text
          style={[styles.footer, type.caption, { color: colors.textSecondary }]}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export interface GroupedRowProps {
  title: string;
  detail?: string;
  accessory?: GroupedRowAccessory;
  value?: string;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  onPress?: () => void;
  accessibilityLabel?: string;
  isLast?: boolean;
}

export function GroupedRow({
  title,
  detail,
  accessory = "none",
  value,
  switchValue,
  onSwitchChange,
  onPress,
  accessibilityLabel,
  isLast = false,
}: GroupedRowProps) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const isValueBelow = groupedRowValueBelow(fontScale, accessory);

  const innerContent = (
    <>
      <View style={styles.contentCol}>
        <Text style={[type.body, { color: colors.text }]}>{title}</Text>
        {detail ? (
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {detail}
          </Text>
        ) : null}
        {accessory === "value" && value && isValueBelow ? (
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {value}
          </Text>
        ) : null}
      </View>
      <View style={styles.accessoryContainer}>
        {accessory === "value" && value && !isValueBelow ? (
          <Text style={[type.body, { color: colors.textSecondary }]}>
            {value}
          </Text>
        ) : null}
        {accessory === "chevron" ? (
          <ChevronRightGlyph color={colors.textSecondary} />
        ) : null}
        {accessory === "switch" ? (
          <NbSwitch
            value={switchValue ?? false}
            onValueChange={onSwitchChange ?? (() => {})}
            accessibilityLabel={title}
          />
        ) : null}
      </View>
    </>
  );

  return (
    <View style={styles.rowWrapper}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={({ pressed }) => [styles.row, pressedStyle(pressed)]}
        >
          {innerContent}
        </Pressable>
      ) : (
        <View accessibilityLabel={accessibilityLabel} style={styles.row}>
          {innerContent}
        </View>
      )}
      {!isLast && (
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginVertical: space.sm,
  },
  header: {
    marginBottom: space.xs,
    paddingHorizontal: space.md,
  },
  footer: {
    marginTop: space.xs,
    paddingHorizontal: space.md,
  },
  block: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  rowWrapper: {
    position: "relative",
  },
  row: {
    minHeight: minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  contentCol: {
    flex: 1,
    gap: space.xs,
  },
  accessoryContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: space.md,
  },
});
