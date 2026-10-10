/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { fixture } from "../data/registroFixture";
import { listHolidays, listOverrides } from "./calendarList";
import * as schema from "./schema";

describe("db/calendarList: listagem de exceções e feriados (Item 4.5)", () => {
  it("listOverrides devolve exceções vivas com dayTypeCode e ignora apagadas", async () => {
    const { db, raw } = await fixture();

    const now = 1760000000000;
    const saturdayId = "dt-sat-test";
    await db.insert(schema.dayType).values({
      id: saturdayId,
      networkId: "net-1",
      code: "saturday",
      name: "Sábado",
      sort: 2,
      source: "official",
      createdAt: now,
      updatedAt: now,
    });

    // Insere uma exceção ativa
    await db.insert(schema.dateOverride).values({
      id: "ov-active-1",
      networkId: "net-1",
      date: "2026-10-15",
      dayTypeId: saturdayId,
      note: "Feira anual",
      source: "user",
      createdAt: now,
      updatedAt: now,
    });

    // Insere uma exceção apagada (soft deleted)
    await db.insert(schema.dateOverride).values({
      id: "ov-deleted-2",
      networkId: "net-1",
      date: "2026-10-16",
      dayTypeId: saturdayId,
      note: "Cancelada",
      source: "user",
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    });

    const list = await listOverrides(db);
    expect(list.some((o) => o.id === "ov-active-1")).toBe(true);
    expect(list.some((o) => o.id === "ov-deleted-2")).toBe(false);

    const active = list.find((o) => o.id === "ov-active-1")!;
    expect(active.date).toBe("2026-10-15");
    expect(active.dayTypeCode).toBe("saturday");
    expect(active.note).toBe("Feira anual");
    expect(active.source).toBe("user");
  });

  it("listHolidays devolve feriados vivos e ignora apagados", async () => {
    const { db } = await fixture();

    const now = 1760000000000;
    // Insere um feriado ativo manual
    await db.insert(schema.holiday).values({
      id: "hol-active-1",
      networkId: "net-1",
      date: "2026-05-22",
      name: "Feriado Municipal",
      scope: "municipal",
      recurring: true,
      source: "official",
      createdAt: now,
      updatedAt: now,
    });

    // Insere um feriado apagado
    await db.insert(schema.holiday).values({
      id: "hol-deleted-2",
      networkId: "net-1",
      date: "2026-06-01",
      name: "Antigo",
      scope: "manual",
      recurring: false,
      source: "user",
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    });

    const list = await listHolidays(db);
    expect(list.some((h) => h.id === "hol-active-1")).toBe(true);
    expect(list.some((h) => h.id === "hol-deleted-2")).toBe(false);

    const active = list.find((h) => h.id === "hol-active-1")!;
    expect(active.name).toBe("Feriado Municipal");
    expect(active.scope).toBe("municipal");
    expect(active.recurring).toBe(true);
  });
});
