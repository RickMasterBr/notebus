import { describe, expect, it } from "vitest";
import { createFakePort } from "./fakePort";
import { ensureAlarmPermission } from "./permission";

// T-60: permissão negada, nada agendado, nenhuma exceção, o app não insiste.
describe("T-60: ensureAlarmPermission", () => {
  it("negada: devolve denied, não pergunta nada e não pede de novo", async () => {
    const port = createFakePort("denied");
    let asked = 0;
    const state = await ensureAlarmPermission(port, { ask: async () => (asked++, true) });
    expect(state).toBe("denied");
    expect(asked).toBe(0);
    expect(port.calls).not.toContain("requestPermission");
    expect(port.scheduled.size).toBe(0);
  });

  it("concedida: devolve granted sem perguntar", async () => {
    const port = createFakePort("granted");
    expect(await ensureAlarmPermission(port)).toBe("granted");
    expect(port.calls).toEqual(["getPermission"]);
  });

  it("ainda não decidida: a tela mostra a frase de motivo (`ask`) e só então vem o pedido do sistema", async () => {
    const port = createFakePort("undetermined");
    const order: string[] = [];
    const state = await ensureAlarmPermission(port, { ask: async () => (order.push("ask"), true) });
    expect(state).toBe("granted");
    expect(port.calls).toEqual(["getPermission", "requestPermission"]);
    expect(order).toEqual(["ask"]);
  });

  it("ainda não decidida e o usuário recusa a frase (ou não há `ask`): não pede ao sistema", async () => {
    const port = createFakePort("undetermined");
    expect(await ensureAlarmPermission(port, { ask: async () => false })).toBe("undetermined");
    expect(await ensureAlarmPermission(port)).toBe("undetermined");
    expect(port.calls).not.toContain("requestPermission");
  });
});
