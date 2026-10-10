import { describe, expect, it } from "vitest";
import { homeCardsPlan } from "./homeCards";

describe("homeCardsPlan (Item 0.1 puro)", () => {
  const measuredHeight = 76;

  it("viagem + oferta → showOffline false, showAny true, effectiveHeight 76", () => {
    const plan = homeCardsPlan({
      hasTripCard: true,
      hasBackupReminder: false,
      offerVisible: true,
      offlineStatus: "none",
      measuredHeight,
    });
    expect(plan.showOffline).toBe(false);
    expect(plan.showAny).toBe(true);
    expect(plan.effectiveHeight).toBe(76);
  });

  it("lembrete + oferta → showOffline false", () => {
    const plan = homeCardsPlan({
      hasTripCard: false,
      hasBackupReminder: true,
      offerVisible: true,
      offlineStatus: "none",
      measuredHeight,
    });
    expect(plan.showOffline).toBe(false);
  });

  it("viagem + lembrete + oferta → showOffline false, showAny true", () => {
    const plan = homeCardsPlan({
      hasTripCard: true,
      hasBackupReminder: true,
      offerVisible: true,
      offlineStatus: "none",
      measuredHeight,
    });
    expect(plan.showOffline).toBe(false);
    expect(plan.showAny).toBe(true);
  });

  it("só oferta → showOffline true, showAny true, effectiveHeight 76", () => {
    const plan = homeCardsPlan({
      hasTripCard: false,
      hasBackupReminder: false,
      offerVisible: true,
      offlineStatus: "none",
      measuredHeight,
    });
    expect(plan.showOffline).toBe(true);
    expect(plan.showAny).toBe(true);
    expect(plan.effectiveHeight).toBe(76);
  });

  it("só downloading (oferta false) → showOffline true", () => {
    const plan = homeCardsPlan({
      hasTripCard: false,
      hasBackupReminder: false,
      offerVisible: false,
      offlineStatus: "downloading",
      measuredHeight,
    });
    expect(plan.showOffline).toBe(true);
  });

  it("ready, oferta false, sem viagem nem lembrete → showOffline false, showAny false, effectiveHeight 0", () => {
    const plan = homeCardsPlan({
      hasTripCard: false,
      hasBackupReminder: false,
      offerVisible: false,
      offlineStatus: "ready",
      measuredHeight,
    });
    expect(plan.showOffline).toBe(false);
    expect(plan.showAny).toBe(false);
    expect(plan.effectiveHeight).toBe(0);
  });
});
