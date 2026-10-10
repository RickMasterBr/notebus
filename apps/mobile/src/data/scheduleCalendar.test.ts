// E-08 (item 3): o `loadSchedule` leva ao domínio o escopo e a repetição de cada feriado e o interruptor dos municipais.
import { dayTypeOf } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { fixture, type Fixture } from "./registroFixture";
import { loadSchedule } from "./schedule";

const T = 1_790_000_000_000;

async function holiday(f: Fixture, id: string, date: string, name: string, scope: string, recurring: 0 | 1) {
  const network = (f.raw.all("SELECT id FROM network", []) as { id: string }[])[0]!.id;
  await f.raw.run(
    "INSERT INTO holiday (id, created_at, updated_at, source, network_id, date, name, scope, recurring) VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?)",
    [id, T, T, network, date, name, scope, recurring],
  );
}

const setSwitch = (f: Fixture, value: string) =>
  f.raw.run("INSERT INTO setting (id, created_at, updated_at, source, `key`, value) VALUES ('set-muni', ?, ?, 'user', 'include_municipal_holidays', ?)", [T, T, value]);

describe("loadSchedule: calendário da E-08", () => {
  it("cada feriado leva scope e recurring ao domínio; o interruptor ausente vale ligado", async () => {
    const f = await fixture();
    await holiday(f, "h-man", "2026-03-03", "3 de março", "manual", 1);
    await holiday(f, "h-mun", "2027-05-22", "Municipal", "municipal", 0);
    const { calendar } = await loadSchedule(f.db);
    expect(calendar.holidays).toEqual(
      expect.arrayContaining([
        { date: "2026-03-03", name: "3 de março", scope: "manual", recurring: true },
        { date: "2027-05-22", name: "Municipal", scope: "municipal", recurring: false },
      ]),
    );
    expect(calendar.includeMunicipal).toBe(true);
    expect(dayTypeOf("2028-03-03", calendar)).toMatchObject({ reason: "holiday", holidayName: "3 de março" });
    expect(dayTypeOf("2027-05-22", calendar)).toMatchObject({ reason: "holiday" });
  });

  it("include_municipal_holidays = false desliga o municipal e deixa o manual valendo", async () => {
    const f = await fixture();
    await holiday(f, "h-man", "2026-03-03", "3 de março", "manual", 1);
    await holiday(f, "h-mun", "2027-05-22", "Municipal", "municipal", 0);
    await setSwitch(f, "false");
    const { calendar } = await loadSchedule(f.db);
    expect(calendar.includeMunicipal).toBe(false);
    expect(dayTypeOf("2027-05-22", calendar)).toEqual({ dayType: "saturday", reason: "weekday" });
    expect(dayTypeOf("2027-03-03", calendar)).toMatchObject({ reason: "holiday" });
  });

  it("include_municipal_holidays = true mantém o municipal", async () => {
    const f = await fixture();
    await holiday(f, "h-mun", "2027-05-22", "Municipal", "municipal", 0);
    await setSwitch(f, "true");
    const { calendar } = await loadSchedule(f.db);
    expect(calendar.includeMunicipal).toBe(true);
    expect(dayTypeOf("2027-05-22", calendar)).toMatchObject({ reason: "holiday" });
  });
});
