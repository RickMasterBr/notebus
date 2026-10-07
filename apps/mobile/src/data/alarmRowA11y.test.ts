import { describe, expect, it } from "vitest";
import { t } from "../i18n";
import { alarmRowA11yActions, isDeleteAction } from "./alarmsUi";

describe("E-06 Item 2: Ação Apagar para VoiceOver na linha do aviso", () => {
  it("devolve a ação delete com o rótulo do catálogo", () => {
    const actions = alarmRowA11yActions();
    expect(actions).toEqual([{ name: "delete", label: t("alarms.delete") }]);
    expect(actions[0]!.label).toBe("Apagar");
  });

  it("isDeleteAction reconhece apenas a ação delete", () => {
    expect(isDeleteAction("delete")).toBe(true);
    expect(isDeleteAction("activate")).toBe(false);
    expect(isDeleteAction("escape")).toBe(false);
  });
});
