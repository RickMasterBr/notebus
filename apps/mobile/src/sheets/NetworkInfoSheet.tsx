/**
 * Folha de detalhe da rede e vigência (TL-12, E-08 bloco 1b, Item 7; D-115).
 *
 * Exibe as informações da rede e da importação da MOBILIS:
 * - Rede (nome)
 * - Arquivo (dataset.name)
 * - Versão (dataset.version)
 * - Importado em (importedAt, data de Lisboa)
 * - Checksum (dataset.checksum, texto selecionável em monoespaçada se disponível)
 * - Vigência desde (validFrom, da tabela timetable)
 *
 * Só leitura. Sem busca remota (D-115).
 */
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { createContext, useContext, useEffect, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { lisbonWallClock } from "@notebus/domain";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lisbonDateText } from "../data/BackupProvider";
import { useNow } from "../data/NowProvider";
import { currentValidFrom } from "../data/settingsView";
import { dateNumbers } from "../data/testClockPicker";
import { selectLive } from "../db/query";
import { dataset, network, timetable } from "../db/schema";
import { getSharedDb } from "../db/sharedDb";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { ListRow } from "../ui/ListRow";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet } from "./StackedSheet";
import { containerHeightOf, detentMetrics } from "./scrollInset";

const HeightContext = createContext<(height: number) => void>(() => {});

function NetworkInfoHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["82%"], initialIndex: 0, Handle: NetworkInfoHandle };

export function NetworkInfoSheet({ id }: { id: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const db = getSharedDb();

  const now = useNow();
  const unknown = t("network.unknown");

  const [handleHeight, setHandleHeight] = useState(0);
  const [info, setInfo] = useState<{
    networkName: string;
    fileName: string;
    version: string;
    importedAt: string;
    checksum: string;
    validFrom: string;
  }>({
    networkName: "MOBILIS Leiria",
    fileName: unknown,
    version: unknown,
    importedAt: unknown,
    checksum: unknown,
    validFrom: unknown,
  });

  useEffect(() => {
    if (!db) return;
    const todayLisbon = lisbonWallClock(now()).date;
    void Promise.all([
      selectLive(db, dataset),
      selectLive(db, network),
      selectLive(db, timetable),
    ]).then(([datasets, networks, timetables]) => {
      const latestDataset = datasets[datasets.length - 1] ?? null;
      const currentNetwork = networks[0] ?? null;
      const validFromStr = currentValidFrom(timetables, todayLisbon);

      setInfo({
        networkName: currentNetwork?.name ?? "MOBILIS Leiria",
        fileName: latestDataset?.name ?? unknown,
        version: latestDataset?.version ?? unknown,
        importedAt: latestDataset?.importedAt ? lisbonDateText(latestDataset.importedAt) : unknown,
        checksum: latestDataset?.checksum ?? unknown,
        validFrom: validFromStr
          ? validFromStr.includes("-")
            ? dateNumbers(validFromStr)
            : validFromStr
          : unknown,
      });
    });
  }, [db, now, unknown]);

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <BottomSheetScrollView
            style={{ height: scrollAreaHeight }}
            contentContainerStyle={styles.scrollContent}
          >
            <Text accessibilityRole="header" style={[type.title, styles.headerTitle, { color: colors.text }]}>
              {t("network.title")}
            </Text>

            <View style={styles.groupedList}>
              {/* 1. Rede */}
              <ListRow
                title={t("network.title")}
                detail={info.networkName}
                accessibilityLabel={`${t("network.title")}. ${info.networkName}`}
              />

              {/* 2. Arquivo */}
              <ListRow
                title={t("network.file")}
                detail={info.fileName}
                accessibilityLabel={`${t("network.file")}. ${info.fileName}`}
              />

              {/* 3. Versão */}
              <ListRow
                title={t("network.version")}
                detail={info.version}
                accessibilityLabel={`${t("network.version")}. ${info.version}`}
              />

              {/* 4. Importado em */}
              <ListRow
                title={t("network.imported_at")}
                detail={info.importedAt}
                accessibilityLabel={`${t("network.imported_at")}. ${info.importedAt}`}
              />

              {/* 5. Checksum (selecionável em monoespaçada se disponível) */}
              <View style={[styles.checksumRow, { borderBottomColor: colors.divider, backgroundColor: colors.bg }]}>
                <Text style={[type.body, { color: colors.text }]}>
                  {t("network.checksum")}
                </Text>
                <Text
                  selectable
                  style={[
                    type.body,
                    styles.checksumValue,
                    { color: colors.textSecondary },
                  ]}
                >
                  {info.checksum}
                </Text>
              </View>

              {/* 6. Vigência desde */}
              <ListRow
                title={t("network.valid_from")}
                detail={info.validFrom}
                accessibilityLabel={`${t("network.valid_from")}. ${info.validFrom}`}
              />
            </View>
          </BottomSheetScrollView>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  headerTitle: {
    paddingTop: space.xs,
  },
  groupedList: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  checksumRow: {
    minHeight: minTouch,
    flexDirection: "column",
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    gap: space.xs,
  },
  checksumValue: {
    fontSize: 12,
    ...Platform.select({
      ios: { fontFamily: "Menlo" },
      android: { fontFamily: "monospace" },
      default: {},
    }),
  },
});
