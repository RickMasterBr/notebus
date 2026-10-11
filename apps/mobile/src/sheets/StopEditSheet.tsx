/**
 * TL-02/E-08 Bloco 3: Edição de ponto (Item 4; D-113, D-150, RNF-06, 4.4 §5.12).
 *
 * Campos, de cima para baixo:
 * 1. Nome (obrigatório)
 * 2. Apelidos (chips com ✕ para remover, campo de novo apelido, botão Adicionar)
 * 3. ID externo (opcional)
 * 4. Nota (opcional, várias linhas)
 * 5. Localização (só de leitura)
 * 6. Rodapé fixo: Salvar (desabilitado quando view.canSave é falso).
 *
 * Modelo da folha: PlaceSheet (quadro D-150 com placeSheetFrame e placeFooterHeight).
 */
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { eq, ne } from "drizzle-orm";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNow } from "../data/NowProvider";
import { useScheduleReload } from "../data/ScheduleProvider";
import { useReloadStopIndex } from "../data/StopIndexProvider";
import { useToast } from "../data/ToastProvider";
import {
  MAX_ALIASES,
  FIELD_LIMITS,
  NEW_STOP_ID,
  addAlias,
  commitPendingAlias,
  stopEditView,
  stopLocationStatusKey,
  validateStopEdit,
  type AliasRefusal,
  type StopEditDraft,
  type StopEditOther,
} from "../data/stopEdit";
import { newStopDraft } from "../data/stopManage";
import { createSubmitGuard } from "../data/submitGuard";
import { selectLive } from "../db/query";
import { stop } from "../db/schema";
import { getSharedDb } from "../db/sharedDb";
import { createStop } from "../db/stopCreate";
import { saveStopEdit } from "../db/stopEdit";
import { t } from "../i18n";
import { minTouch, radius, space, type, useTheme } from "../theme";
import { CrossGlyph } from "../ui/Glyphs";
import { Skeleton } from "../ui/Skeleton";
import { SheetHandle } from "./SheetHandle";
import { type StackedDetents, StackedSheet, useCloseSheet } from "./StackedSheet";
import { placeFooterHeight, placeSheetFrame } from "./placeFrame";
import { containerHeightOf, detentMetrics } from "./scrollInset";
import { useKeyboardHeight } from "./useKeyboardHeight";

const HeightContext = createContext<(height: number) => void>(() => {});

function StopEditHandle({ onClose }: { onClose: () => void }) {
  const setHandleHeight = useContext(HeightContext);
  return (
    <View collapsable={false} onLayout={(e) => setHandleHeight(e.nativeEvent.layout.height)}>
      <SheetHandle kind="close" hideCloseButton onPress={onClose} />
    </View>
  );
}

const DETENTS: StackedDetents = { snapPoints: ["95%"], initialIndex: 0, Handle: StopEditHandle };

export function StopEditSheet({ id, stopId }: { id: number; stopId: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const close = useCloseSheet();
  const now = useNow();
  const toast = useToast();
  const reloadStopIndex = useReloadStopIndex();
  // Os horários guardam o nome do ponto (`stopNames`): sem recarregar, as outras folhas mostram o nome antigo.
  const reloadSchedule = useScheduleReload();
  const db = getSharedDb();
  const isNew = stopId === NEW_STOP_ID;
  // O teclado cobria a Nota, o ID externo e o novo apelido: a rolagem ganha o espaço do teclado (E-08 bloco 5, item 2).
  const keyboard = useKeyboardHeight();
  const scrollRef = useRef<React.ElementRef<typeof BottomSheetScrollView>>(null);
  const sectionY = useRef(new Map<string, number>());
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToSection = useCallback((key: string) => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    // Espera o teclado subir: o espaço extra do fim só existe depois do `keyboardWillShow`.
    focusTimer.current = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, (sectionY.current.get(key) ?? 0) - space.sm), animated: true });
    }, 150);
  }, []);
  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );

  const [handleHeight, setHandleHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [original, setOriginal] = useState<StopEditDraft>(newStopDraft);
  const [draft, setDraft] = useState<StopEditDraft>(newStopDraft);
  const [others, setOthers] = useState<StopEditOther[]>([]);
  const [locationInfo, setLocationInfo] = useState<{
    lat: number | null;
    lon: number | null;
    locationSource: "manual" | "suggested" | null;
  }>({
    lat: null,
    lon: null,
    locationSource: null,
  });

  const [newAliasText, setNewAliasText] = useState("");
  const [aliasError, setAliasError] = useState<AliasRefusal | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!db) return;
      if (isNew) {
        // Ponto novo: começa vazio e só precisa dos outros pontos para conferir o ID externo.
        const allRows = await selectLive(db, stop);
        if (!active) return;
        setOthers(allRows.map((o) => ({ id: o.id, name: o.name, externalId: o.externalId })));
        setLoading(false);
        return;
      }
      const [row] = await selectLive(db, stop, eq(stop.id, stopId));
      if (!row || !active) return;
      const othersRows = await selectLive(db, stop, ne(stop.id, stopId));
      if (!active) return;
      const initial: StopEditDraft = {
        name: row.name,
        externalId: row.externalId,
        note: row.note,
        aliases: row.aliases,
      };
      setOriginal(initial);
      setDraft(initial);
      setOthers(
        othersRows.map((o) => ({
          id: o.id,
          name: o.name,
          externalId: o.externalId,
        })),
      );
      setLocationInfo({
        lat: row.lat,
        lon: row.lon,
        locationSource: row.locationSource,
      });
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [stopId]);

  const validation = useMemo(
    () =>
      validateStopEdit({
        name: draft.name,
        externalId: draft.externalId,
        note: draft.note,
        aliases: draft.aliases,
        others,
        originalExternalId: original.externalId,
      }),
    [draft, others, original.externalId],
  );

  const view = useMemo(
    () =>
      stopEditView({
        original,
        draft,
        validation,
        aliasError,
        pendingAlias: newAliasText,
      }),
    [original, draft, validation, aliasError, newAliasText],
  );

  const handleAddAlias = () => {
    const result = addAlias(draft.aliases, newAliasText, draft.name);
    if (result.ok) {
      setDraft((prev) => ({ ...prev, aliases: result.aliases }));
      setNewAliasText("");
      setAliasError(null);
    } else {
      if (result.reason !== "empty") {
        setAliasError(result.reason);
      }
    }
  };

  const handleRemoveAlias = (indexToRemove: number) => {
    setDraft((prev) => ({
      ...prev,
      aliases: prev.aliases.filter((_, idx) => idx !== indexToRemove),
    }));
    setAliasError(null);
  };

  const submitGuard = useRef(createSubmitGuard()).current;

  const handleSave = async () => {
    if (!view.canSave || !validation.ok) return;
    await submitGuard.run(async () => {
      if (!db) return;
      // O texto que ficou no campo de apelido entra ao Salvar; se for inválido, o erro aparece no campo e nada é gravado.
      const committed = commitPendingAlias(draft.aliases, newAliasText, draft.name);
      if (!committed.ok) {
        setAliasError(committed.reason);
        return;
      }
      const nowMs = now();
      const values = {
        name: draft.name,
        aliases: committed.aliases,
        externalId: draft.externalId,
        note: draft.note,
      };
      const result = isNew
        ? await createStop(db, values, nowMs)
        : await saveStopEdit(db, stopId, values, nowMs);
      if (result.ok) {
        await reloadStopIndex();
        await reloadSchedule();
        close();
        toast.show({
          title: isNew ? t("stop_new.saved") : t("stop_edit.toast.saved"),
          haptic: "success",
          action: {
            label: t("toast.action.undo"),
            run: async () => {
              const undone = await result.undo(now());
              await reloadStopIndex();
              await reloadSchedule();
              if (!undone.ok) {
                toast.show({
                  title: t("stop_edit.error.stale"),
                  kind: "error",
                  haptic: "error",
                });
              }
            },
          },
        });
      } else if (result.reason === "no_network") {
        toast.show({ title: t("stop_new.error.no_network"), kind: "error", haptic: "error" });
      } else {
        setSaveError(
          result.reason === "duplicate_external_id"
            ? t("stop_edit.error.external_id_taken", { name: "" })
            : t("stop_edit.error.generic"),
        );
      }
    });
  };

  const scrollAreaHeight = Math.max(
    80,
    Math.round(
      detentMetrics(DETENTS.snapPoints, containerHeightOf(window.height, insets.top), handleHeight)[0]
        ?.scrollAreaHeight ?? 0,
    ),
  );

  const footerHeight = placeFooterHeight({
    minTouch,
    space,
    bottomInset: insets.bottom,
  });
  const { listHeight } = placeSheetFrame({
    scrollAreaHeight,
    footerHeight,
  });

  return (
    <HeightContext.Provider value={setHandleHeight}>
      <StackedSheet id={id} detents={DETENTS}>
        <View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>
          <View collapsable={false} style={{ height: listHeight, overflow: "hidden" }}>
            <BottomSheetScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.scrollContent, { paddingBottom: space.lg + keyboard }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Cabeçalho */}
              <View style={styles.header}>
                <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                  {isNew ? t("stop_new.title") : t("stop_edit.title")}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common.close")}
                  onPress={close}
                  style={styles.closeHitTarget}
                >
                  <View style={[styles.closeIconCircle, { backgroundColor: colors.fill }]}>
                    <CrossGlyph color={colors.textSecondary} />
                  </View>
                </Pressable>
              </View>

              {loading ? (
                <Skeleton rows={3} />
              ) : (
                <>
                  {saveError ? (
                    <Text style={[type.caption, { color: colors.danger }]}>{saveError}</Text>
                  ) : null}

                  {/* 1. Nome (obrigatório) */}
                  <View style={styles.section}>
                    <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                      {t("stop_edit.name")}
                    </Text>
                    <BottomSheetTextInput
                      value={draft.name}
                      maxLength={FIELD_LIMITS.name}
                      onChangeText={(val) => {
                        setDraft((prev) => ({ ...prev, name: val }));
                        setSaveError(null);
                      }}
                      placeholder={t("stop_edit.name")}
                      placeholderTextColor={colors.textSecondary}
                      style={[
                        type.body,
                        styles.textInput,
                        { backgroundColor: colors.fill, color: colors.text },
                      ]}
                    />
                    {view.nameError === "required" ? (
                      <Text style={[type.caption, { color: colors.danger }]}>
                        {t("stop_edit.error.name_required")}
                      </Text>
                    ) : view.nameError === "too_long" ? (
                      <Text style={[type.caption, { color: colors.danger }]}>
                        {t("stop_edit.error.too_long")}
                      </Text>
                    ) : null}
                  </View>

                  {/* 2. Apelidos */}
                  <View style={styles.section} onLayout={(e) => sectionY.current.set("aliases", e.nativeEvent.layout.y)}>
                    <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                      {t("stop_edit.aliases")}
                    </Text>
                    <View style={styles.addAliasRow}>
                      <BottomSheetTextInput
                        value={newAliasText}
                        maxLength={FIELD_LIMITS.alias}
                        onChangeText={(val) => {
                          setNewAliasText(val);
                          setAliasError(null);
                        }}
                        placeholder={t("stop_edit.alias.placeholder")}
                        placeholderTextColor={colors.textSecondary}
                        returnKeyType="done"
                        onFocus={() => scrollToSection("aliases")}
                        onSubmitEditing={handleAddAlias}
                        style={[
                          type.body,
                          styles.aliasInput,
                          { backgroundColor: colors.fill, color: colors.text },
                        ]}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("stop_edit.alias.add")}
                        onPress={handleAddAlias}
                        style={[styles.addAliasButton, { backgroundColor: colors.fill }]}
                      >
                        <Text style={[type.bodyStrong, { color: colors.accent }]}>
                          {t("stop_edit.alias.add")}
                        </Text>
                      </Pressable>
                    </View>
                    {view.aliasError === "duplicate" ? (
                      <Text style={[type.caption, { color: colors.danger }]}>
                        {t("stop_edit.error.alias_duplicate")}
                      </Text>
                    ) : view.aliasError === "same_as_name" ? (
                      <Text style={[type.caption, { color: colors.danger }]}>
                        {t("stop_edit.error.alias_same_as_name")}
                      </Text>
                    ) : view.aliasError === "too_many" ? (
                      <Text style={[type.caption, { color: colors.danger }]}>
                        {t("stop_edit.error.alias_too_many", { max: MAX_ALIASES })}
                      </Text>
                    ) : view.aliasError === "too_long" ? (
                      <Text style={[type.caption, { color: colors.danger }]}>
                        {t("stop_edit.error.too_long")}
                      </Text>
                    ) : null}

                    {draft.aliases.length > 0 ? (
                      <View style={styles.chipsRow}>
                        {draft.aliases.map((alias, index) => (
                          <View
                            key={`${alias}-${index}`}
                            style={[styles.aliasChip, { backgroundColor: colors.fill }]}
                          >
                            <Text style={[type.body, { color: colors.text }]}>{alias}</Text>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={t("stop_edit.alias.remove.a11y", { alias })}
                              onPress={() => handleRemoveAlias(index)}
                              style={styles.chipRemoveButton}
                            >
                              <CrossGlyph color={colors.textSecondary} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  {/* 3. ID externo (opcional) */}
                  <View style={styles.section} onLayout={(e) => sectionY.current.set("externalId", e.nativeEvent.layout.y)}>
                    <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                      {t("stop_edit.external_id")}
                    </Text>
                    <BottomSheetTextInput
                      value={draft.externalId ?? ""}
                      maxLength={FIELD_LIMITS.externalId}
                      onChangeText={(val) => {
                        setDraft((prev) => ({ ...prev, externalId: val }));
                        setSaveError(null);
                      }}
                      placeholder={t("stop_edit.external_id")}
                      placeholderTextColor={colors.textSecondary}
                      onFocus={() => scrollToSection("externalId")}
                      style={[
                        type.body,
                        styles.textInput,
                        { backgroundColor: colors.fill, color: colors.text },
                      ]}
                    />
                    {view.externalIdTooLong ? (
                      <Text style={[type.caption, { color: colors.danger }]}>
                        {t("stop_edit.error.too_long")}
                      </Text>
                    ) : null}
                    {view.externalIdError ? (
                      <Text style={[type.caption, { color: colors.danger }]}>
                        {t("stop_edit.error.external_id_taken", {
                          name: view.externalIdError.duplicateOf,
                        })}
                      </Text>
                    ) : null}
                  </View>

                  {/* 4. Nota (opcional, várias linhas) */}
                  <View style={styles.section} onLayout={(e) => sectionY.current.set("note", e.nativeEvent.layout.y)}>
                    <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                      {t("stop_edit.note")}
                    </Text>
                    <BottomSheetTextInput
                      value={draft.note ?? ""}
                      maxLength={FIELD_LIMITS.note}
                      onChangeText={(val) => {
                        setDraft((prev) => ({ ...prev, note: val }));
                        setSaveError(null);
                      }}
                      placeholder={t("stop_edit.note")}
                      placeholderTextColor={colors.textSecondary}
                      multiline
                      numberOfLines={3}
                      onFocus={() => scrollToSection("note")}
                      style={[
                        type.body,
                        styles.textInputMultiline,
                        { backgroundColor: colors.fill, color: colors.text },
                      ]}
                    />
                    {view.noteError === "too_long" ? (
                      <Text style={[type.caption, { color: colors.danger }]}>
                        {t("stop_edit.error.too_long")}
                      </Text>
                    ) : null}
                  </View>

                  {/* 5. Localização (só de leitura; o ponto novo ainda não tem) */}
                  {isNew ? null : (
                    <View style={styles.section}>
                      <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                        {t("stop_edit.location")}
                      </Text>
                      <View style={[styles.readOnlyRow, { backgroundColor: colors.fill }]}>
                        <Text style={[type.body, { color: colors.textSecondary }]}>
                          {t(
                            stopLocationStatusKey(
                              locationInfo.lat,
                              locationInfo.lon,
                              locationInfo.locationSource,
                            ),
                          )}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}
            </BottomSheetScrollView>
          </View>

          {/* 6. Rodapé fixo com botão Salvar */}
          <View
            style={[
              styles.footer,
              {
                height: footerHeight,
                borderTopColor: colors.divider,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              disabled={!view.canSave}
              accessibilityState={{ disabled: !view.canSave }}
              onPress={() => void handleSave()}
              style={[
                styles.saveButton,
                { backgroundColor: colors.accent, opacity: !view.canSave ? 0.4 : 1 },
              ]}
            >
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
                {t("common.save")}
              </Text>
            </Pressable>
          </View>
        </View>
      </StackedSheet>
    </HeightContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.md,
    gap: space.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: space.xs,
  },
  closeHitTarget: {
    minWidth: minTouch,
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    gap: space.xs,
  },
  textInput: {
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  textInputMultiline: {
    minHeight: minTouch * 1.5,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    textAlignVertical: "top",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  aliasChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space.md,
    borderRadius: radius.full,
    minHeight: minTouch,
  },
  chipRemoveButton: {
    minWidth: minTouch,
    minHeight: minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  addAliasRow: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "center",
  },
  aliasInput: {
    flex: 1,
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  addAliasButton: {
    minHeight: minTouch,
    minWidth: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  readOnlyRow: {
    minHeight: minTouch,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    justifyContent: "center",
  },
  footer: {
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveButton: {
    minHeight: minTouch,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
