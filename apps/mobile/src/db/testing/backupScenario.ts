/// <reference types="node" />
/**
 * SÓ PARA TESTE. Um banco com registros de **todos** os tipos (E-03 T-23), sobre a rede inventada de `registroFixture`
 * (nada da MOBILIS, D-091). Ids e instantes fixos: o mesmo cenário gera sempre o mesmo arquivo (o exemplo da v1).
 *
 * Quinta 08/10/2026 (hora de verão), na ordem:
 * 1. embarque L1 na Arrabalde 08:12:30 (auto) → descida no Campus 08:45 → ride `closed` com descida;
 * 2. embarque L1 na Arrabalde 08:42 → "Não embarquei" → registro `passed`, ride `dismissed`;
 * 3. embarque L1 na Arrabalde 12:00 (nenhuma viagem: `orphan`); outro às 13:00, depois escolhido à mão → `manual`;
 * 4. embarque L1 no Estádio 08:54 (pos. 6 da 08:10 e pos. 3 da 08:40: `ambiguous`) → fecha o ride anterior; fica `open`;
 * 5. embarque L2 na Arrabalde 08:31 e Desfazer → registro e ride apagados (`deleted_at`), o ride 4 reabre (D-157);
 * mais um lugar, um tempo a pé, duas preferências (vão), dois estados do aparelho (não vão), uma edição oficial e,
 * com `withAlarm` (o exemplo da formatVersion 2, E-06, D-104), um aviso de saída (vai) e um evento do aviso (não vai);
 * com `withLocation` (o exemplo da formatVersion 3, E-07): a edição oficial ganha localização, há um ponto criado por você com
 * localização, o lugar Casa ganha `lat/lon` e o primeiro embarque ganha `gps_*`.
 */
import { migrations } from "../migrations";
import { THURSDAY, fixture, lineId, lisbon, stopId, tripIdOf, type Fixture } from "../../data/registroFixture";

/** Instante da dedução e das gravações à mão (fixo, para o arquivo não mudar entre execuções). */
export const SCENARIO_NOW = lisbon(THURSDAY, "18:00");

export async function backupScenario(opts: { withAlarm?: boolean; withLocation?: boolean } = {}): Promise<Fixture & { ids: Record<string, string> }> {
  let n = 0;
  const f = await fixture({ newId: () => `0199c3a0-0000-7000-8000-${String(++n).padStart(12, "0")}` });
  await f.raw.exec(`PRAGMA user_version = ${migrations.length}`);
  const r = f.registro;
  const A = stopId("A");

  const b1 = await r.board({ stopId: A, lineId: lineId("1"), at: lisbon(THURSDAY, "08:12", "30") });
  const data = f.data;
  const trip = data.trips.find((t) => t.id === tripIdOf("1", "0810"))!;
  const down = await r.alight({ rideId: b1.rideId, stopId: stopId("K"), patternId: trip.patternId, position: 5, at: lisbon(THURSDAY, "08:45") });
  if (!down.ok) throw new Error(down.problem);
  const b2 = await r.board({ stopId: A, lineId: lineId("1"), at: lisbon(THURSDAY, "08:42") });
  await r.notBoarded(b2.rideId, lisbon(THURSDAY, "08:43"));
  const b3 = await r.board({ stopId: A, lineId: lineId("1"), at: lisbon(THURSDAY, "12:00") });
  const b3m = await r.board({ stopId: A, lineId: lineId("1"), at: lisbon(THURSDAY, "13:00") });
  const b4 = await r.board({ stopId: stopId("E"), lineId: lineId("1"), at: lisbon(THURSDAY, "08:54") });
  const b5 = await r.board({ stopId: A, lineId: lineId("2"), at: lisbon(THURSDAY, "08:31") });
  await r.undoBoard(b5, lisbon(THURSDAY, "08:32"));
  await r.refreshDeductions(SCENARIO_NOW);

  const t = SCENARIO_NOW;
  // Você escolheu a viagem à mão (TL-09, E-04): `manual`, que a fila nunca recalcula.
  await f.raw.run(
    "UPDATE observation SET match_status = 'manual', trip_id = ?, deviation_min = 0, updated_at = ? WHERE id = ?",
    [tripIdOf("1", "0840"), t, b3m.observationId],
  );
  await f.raw.run("INSERT INTO place (id, created_at, updated_at, source, name, icon, is_shortcut, shortcut_order) VALUES ('place-casa', ?, ?, 'user', 'Casa', 'house', 1, 1)", [t, t]);
  await f.raw.run("INSERT INTO walk_time (id, created_at, updated_at, source, stop_id, place_id, minutes_min, minutes_max, origin) VALUES ('walk-casa-a', ?, ?, 'user', ?, 'place-casa', 6, 8, 'manual')", [t, t, A]);
  for (const [id, key, value] of [
    ["set-margin", "margin_minutes", "3"],
    ["set-recent", "recent_stops", JSON.stringify([A, stopId("K")])],
    ["set-first", "first_run_done", "true"],
    ["set-export", "last_export_at", String(t - 86_400_000)],
  ] as const) {
    await f.raw.run("INSERT INTO setting (id, created_at, updated_at, source, `key`, value) VALUES (?, ?, ?, 'user', ?, ?)", [id, t, t, key, value]);
  }
  // Um aviso de saída (seg, qua e sex, viagem das 08:10) e um evento dele: o aviso vai no arquivo, o evento não (D-104).
  if (opts.withAlarm) {
    await f.raw.run(
      "INSERT INTO departure_alarm (id, created_at, updated_at, source, option_id, anchor_trip_id, anchor_base_minute, weekdays, once_date, valid_from, valid_to, enabled) VALUES ('alarm-facul', ?, ?, 'user', 'option-facul', ?, 492, '[1,3,5]', NULL, '2026-10-01', '2027-01-31', 1)",
      [t, t, tripIdOf("1", "0810")],
    );
    await f.raw.run(
      "INSERT INTO alarm_event (id, created_at, updated_at, source, alarm_id, planned_at, service_date, trip_id, state, skip_reason, acted_at, snoozed_to) VALUES ('alarm-event-1', ?, ?, 'user', 'alarm-facul', ?, '2026-10-09', ?, 'boarded', NULL, ?, NULL)",
      [t, t, t + 3_600_000, tripIdOf("1", "0810"), t + 3_660_000],
    );
  }
  // Uma edição sua num dado oficial: um apelido e uma nota na Arrabalde (`official_edited`).
  await f.raw.run(
    "UPDATE stop SET source = 'official_edited', aliases = ?, note = 'lado do rio', created_at = ?, updated_at = ? WHERE id = ?",
    [JSON.stringify(["Arrabalde"]), t, t, A],
  );
  // E-07 (formatVersion 3): coordenadas inventadas em Leiria. A edição oficial ganha localização guardada pelo uso, um ponto
  // criado por você nasce com localização, o lugar Casa ganha `lat/lon` e o primeiro embarque guarda o GPS do momento.
  if (opts.withLocation) {
    await f.raw.run("UPDATE stop SET lat = 39.7441, lon = -8.8072, location_source = 'suggested' WHERE id = ?", [A]);
    await f.raw.run(
      "INSERT INTO stop (id, created_at, updated_at, source, network_id, name, aliases, lat, lon, location_source) SELECT 'stop-do-rick', ?, ?, 'user', network_id, 'Ponto do Rick', '[]', 39.7455, -8.8040, 'manual' FROM stop WHERE id = ?",
      [t, t, A],
    );
    await f.raw.run("UPDATE place SET lat = 39.7430, lon = -8.8100 WHERE id = 'place-casa'", []);
    await f.raw.run("UPDATE observation SET gps_lat = 39.7441, gps_lon = -8.8072, gps_accuracy_m = 12.5 WHERE id = ?", [b1.observationId]);
  }
  return { ...f, ids: { b1: b1.observationId, b2: b2.observationId, b3: b3.observationId, b3m: b3m.observationId, b4: b4.observationId, b5: b5.observationId, alight: down.token.observationId } };
}
