/**
 * Decisões puras para o índice e navegação de Ajustes (E-08.5 Bloco 15, D-206, D-207).
 * Puro: sem React e sem efeitos colaterais.
 */
import type { DayTypeCode } from "@notebus/domain";
import { t, type MessageKey } from "../i18n";

export type SettingsPage = "root" | "name" | "margin" | "days" | "holidays" | "map" | "backup" | "about";

export type SettingsNavAction =
  | { type: "open"; page: SettingsPage }
  | { type: "back" };

export function settingsNavReduce(page: SettingsPage, action: SettingsNavAction): SettingsPage {
  if (action.type === "open") return action.page;
  return "root";
}

export interface SettingsHandleInfo {
  showClose: boolean;
  press: "close" | "back";
}

export function settingsHandle(page: SettingsPage): SettingsHandleInfo {
  const isRoot = page === "root";
  return {
    showClose: isRoot,
    press: isRoot ? "close" : "back",
  };
}

export function settingsPageTitle(page: SettingsPage): MessageKey {
  switch (page) {
    case "name":
      return "settings.name.title";
    case "margin":
      return "settings.margin.title";
    case "days":
      return "settings.days.row";
    case "holidays":
      return "settings.holidays.row";
    case "map":
      return "settings.offline_map.title";
    case "backup":
      return "settings.data.backup_row";
    case "about":
      return "settings.about.title";
    case "root":
    default:
      return "settings.title";
  }
}

export function normalizeUserName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (!collapsed) return null;
  const cut = collapsed.slice(0, 24).trim();
  return cut.length > 0 ? cut : null;
}

export interface SettingsIndexInput {
  userName: string | null;
  placeNames: string[];
  margin: number;
  todayDayType: DayTypeCode | null;
  upcomingOverrides: number;
  includeMunicipal: boolean;
  alarmsAllowed: boolean;
  activeAlarms: number;
  networkName: string | null;
  offlineDetail: string;
  backupText: string;
}

export interface SettingsIndexView {
  nameValue: string;
  placesValue: string;
  marginValue: string;
  daysValue: string;
  holidaysValue: string;
  alertsHint: string;
  alertsCount: string;
  networkName: string | null;
  mapValue: string;
  backupValue: string;
}

export function settingsIndexView(input: SettingsIndexInput): SettingsIndexView {
  const normalizedName = normalizeUserName(input.userName);
  const nameValue = normalizedName ?? t("settings.name.empty");

  let placesValue: string;
  if (input.placeNames.length === 0) {
    placesValue = t("settings.places.none");
  } else if (input.placeNames.length <= 3) {
    placesValue = input.placeNames.join(", ");
  } else {
    const firstThree = input.placeNames.slice(0, 3).join(", ");
    placesValue = `${firstThree} ${t("settings.places.more", { n: input.placeNames.length - 3 })}`;
  }

  const marginValue = t("settings.margin.value", { n: input.margin });

  let exceptionsText: string;
  if (input.upcomingOverrides === 0) {
    exceptionsText = t("settings.days.exceptions.none");
  } else if (input.upcomingOverrides === 1) {
    exceptionsText = t("settings.days.exceptions.one");
  } else {
    exceptionsText = t("settings.days.exceptions.many", { n: input.upcomingOverrides });
  }

  let daysValue: string;
  if (input.todayDayType === null) {
    daysValue = exceptionsText;
  } else {
    const typeKey =
      input.todayDayType === "weekday"
        ? "settings.days.today.weekday"
        : input.todayDayType === "saturday"
          ? "settings.days.today.saturday"
          : "settings.days.today.sunday_holiday";
    daysValue = t("settings.days.value", {
      type: t(typeKey),
      exceptions: exceptionsText,
    });
  }

  const holidaysValue = input.includeMunicipal
    ? t("settings.holidays.value_municipal")
    : t("settings.holidays.value_national");

  const alertsHint = input.alarmsAllowed
    ? t("settings.alarms.on_hint")
    : t("settings.alarms.off_hint");

  return {
    nameValue,
    placesValue,
    marginValue,
    daysValue,
    holidaysValue,
    alertsHint,
    alertsCount: String(input.activeAlarms),
    networkName: input.networkName ?? null,
    mapValue: input.offlineDetail,
    backupValue: input.backupText,
  };
}
