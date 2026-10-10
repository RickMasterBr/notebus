import type { OfflineMapStatus } from "./mapOfflineState";

export interface HomeCardsInput {
  hasTripCard: boolean;
  hasBackupReminder: boolean;
  offerVisible: boolean;
  offlineStatus: OfflineMapStatus["kind"];
  measuredHeight: number;
}

export interface HomeCardsPlan {
  showOffline: boolean;
  showAny: boolean;
  effectiveHeight: number;
}

export function homeCardsPlan(input: HomeCardsInput): HomeCardsPlan {
  const showOffline =
    !input.hasTripCard &&
    !input.hasBackupReminder &&
    (input.offerVisible || input.offlineStatus === "downloading");
  const showAny = input.hasTripCard || input.hasBackupReminder || showOffline;
  const effectiveHeight = showAny ? input.measuredHeight : 0;

  return {
    showOffline,
    showAny,
    effectiveHeight,
  };
}
