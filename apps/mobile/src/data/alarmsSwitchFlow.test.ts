/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { alarmsSwitchDecision } from "./alarmsSwitchFlow";

describe("alarmsSwitchFlow: fluxo de decisão do interruptor de avisos (Item 6)", () => {
  it("desligar o interruptor sempre devolve disable", () => {
    expect(alarmsSwitchDecision("granted", false)).toBe("disable");
    expect(alarmsSwitchDecision("undetermined", false)).toBe("disable");
    expect(alarmsSwitchDecision("denied", false)).toBe("disable");
  });

  it("ligar pela primeira vez (undetermined) devolve ask_reason (motivo antes do sistema)", () => {
    expect(alarmsSwitchDecision("undetermined", true)).toBe("ask_reason");
  });

  it("ligar com permissão já concedida (granted) devolve enable sem pedir motivo", () => {
    expect(alarmsSwitchDecision("granted", true)).toBe("enable");
  });

  it("ligar com permissão negada (denied) devolve denied para abrir ajustes", () => {
    expect(alarmsSwitchDecision("denied", true)).toBe("denied");
  });
});
