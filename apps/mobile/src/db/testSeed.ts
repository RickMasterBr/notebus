/**
 * Rede mínima inventada para testes no simulador / Maestro (E-09 §3.4, T-92 a T-94).
 * Ligada apenas quando `EXPO_PUBLIC_NB_TEST_SEED=1`.
 *
 * Importa dados sintéticos (nada da MOBILIS):
 * - 1 rede ("Rede Teste", Europe/Lisbon)
 * - 3 pontos: "Arrabalde", "Facul" e "Casa"
 * - 1 linha: "Linha 1" (código "1", cor #007AFF)
 * - 1 percurso: Arrabalde -> Facul -> Casa
 * - Viagens distribuídas pelo dia para garantir horários válidos em qualquer execução
 * - Atalho "Facul" com trajeto e opção de ônibus
 * - Primeiro uso marcado e "Arrabalde" nos recentes
 *
 * Importação totalmente idempotente (INSERT OR IGNORE).
 */

export interface SqlExecutor {
  exec?: (sql: string) => Promise<void> | void;
  execAsync?: (sql: string) => Promise<void>;
  execSync?: (sql: string) => void;
}

export function isTestSeedEnabled(): boolean {
  return process.env.EXPO_PUBLIC_NB_TEST_SEED === "1";
}

const SEED_TIMESTAMP = 1_790_000_000_000;

export function buildTestSeedSql(now = SEED_TIMESTAMP): string[] {
  const t = now;
  const sqls: string[] = [
    // 1. Rede e Dataset
    `INSERT OR IGNORE INTO network (id, created_at, updated_at, source, official_key, name, timezone) VALUES ('seed-net', ${t}, ${t}, 'official', 'seed/net', 'Rede Teste', 'Europe/Lisbon');`,
    `INSERT OR IGNORE INTO dataset (id, created_at, updated_at, source, network_id, name, version, imported_at, checksum) VALUES ('seed-ds', ${t}, ${t}, 'official', 'seed-net', 'seed', '2026-10-16', ${t}, 'seed-checksum');`,

    // 2. Tipos de dia
    `INSERT OR IGNORE INTO day_type (id, created_at, updated_at, source, official_key, network_id, code, name, sort) VALUES ('seed-dt-wd', ${t}, ${t}, 'official', 'seed/weekday', 'seed-net', 'weekday', 'Dia útil', 1);`,
    `INSERT OR IGNORE INTO day_type (id, created_at, updated_at, source, official_key, network_id, code, name, sort) VALUES ('seed-dt-sat', ${t}, ${t}, 'official', 'seed/saturday', 'seed-net', 'saturday', 'Sábado', 2);`,
    `INSERT OR IGNORE INTO day_type (id, created_at, updated_at, source, official_key, network_id, code, name, sort) VALUES ('seed-dt-sun', ${t}, ${t}, 'official', 'seed/sunday', 'seed-net', 'sunday_holiday', 'Domingo e feriados', 3);`,

    // 3. Pontos (Arrabalde, Facul, Casa)
    `INSERT OR IGNORE INTO stop (id, created_at, updated_at, source, official_key, network_id, name, aliases, external_id, lat, lon) VALUES ('seed-stop-arrabalde', ${t}, ${t}, 'official', 'seed/stop-arrabalde', 'seed-net', 'Arrabalde', '["arrabalde"]', '1001', 39.7436, -8.8071);`,
    `INSERT OR IGNORE INTO stop (id, created_at, updated_at, source, official_key, network_id, name, aliases, external_id, lat, lon) VALUES ('seed-stop-facul', ${t}, ${t}, 'official', 'seed/stop-facul', 'seed-net', 'Facul', '["facul"]', '1002', 39.7350, -8.8120);`,
    `INSERT OR IGNORE INTO stop (id, created_at, updated_at, source, official_key, network_id, name, aliases, external_id, lat, lon) VALUES ('seed-stop-casa', ${t}, ${t}, 'official', 'seed/stop-casa', 'seed-net', 'Casa', '["casa"]', '1003', 39.7500, -8.8000);`,

    // 4. Linha e Percurso
    `INSERT OR IGNORE INTO line (id, created_at, updated_at, source, official_key, network_id, code, name, color) VALUES ('seed-line-1', ${t}, ${t}, 'official', 'seed/line-1', 'seed-net', '1', 'Linha 1', '#007AFF');`,
    `INSERT OR IGNORE INTO pattern (id, created_at, updated_at, source, official_key, line_id, label, is_circular) VALUES ('seed-pat-1', ${t}, ${t}, 'official', 'seed/pattern-1', 'seed-line-1', 'sentido Facul', 0);`,

    // 5. Paragens do Percurso (1: Arrabalde, 2: Facul, 3: Casa)
    `INSERT OR IGNORE INTO pattern_stop (id, created_at, updated_at, source, official_key, pattern_id, position, stop_id, is_timepoint, timepoint_label) VALUES ('seed-ps-1', ${t}, ${t}, 'official', 'seed/ps-1', 'seed-pat-1', 1, 'seed-stop-arrabalde', 1, 'Arrabalde');`,
    `INSERT OR IGNORE INTO pattern_stop (id, created_at, updated_at, source, official_key, pattern_id, position, stop_id, is_timepoint, timepoint_label) VALUES ('seed-ps-2', ${t}, ${t}, 'official', 'seed/ps-2', 'seed-pat-1', 2, 'seed-stop-facul', 1, 'Facul');`,
    `INSERT OR IGNORE INTO pattern_stop (id, created_at, updated_at, source, official_key, pattern_id, position, stop_id, is_timepoint, timepoint_label) VALUES ('seed-ps-3', ${t}, ${t}, 'official', 'seed/ps-3', 'seed-pat-1', 3, 'seed-stop-casa', 1, 'Casa');`,

    // 6. Timetable
    `INSERT OR IGNORE INTO timetable (id, created_at, updated_at, source, official_key, pattern_id, dataset_id, valid_from) VALUES ('seed-tt-1', ${t}, ${t}, 'official', 'seed/tt-1', 'seed-pat-1', 'seed-ds', '2026-01-01');`,
  ];

  // 7. Viagens ao longo do dia (das 06:00 às 23:00 a cada 30 min)
  for (let hour = 6; hour <= 23; hour++) {
    for (const min of [0, 30]) {
      const serviceMinute = hour * 60 + min;
      const tripId = `seed-trip-${hour}-${min}`;
      sqls.push(
        `INSERT OR IGNORE INTO trip (id, created_at, updated_at, source, official_key, timetable_id, first_position, last_position) VALUES ('${tripId}', ${t}, ${t}, 'official', 'seed/${tripId}', 'seed-tt-1', 1, 3);`,
        `INSERT OR IGNORE INTO trip_day_type (id, created_at, updated_at, source, trip_id, day_type_id) VALUES ('seed-tdt-${hour}-${min}-wd', ${t}, ${t}, 'official', '${tripId}', 'seed-dt-wd');`,
        `INSERT OR IGNORE INTO trip_day_type (id, created_at, updated_at, source, trip_id, day_type_id) VALUES ('seed-tdt-${hour}-${min}-sat', ${t}, ${t}, 'official', '${tripId}', 'seed-dt-sat');`,
        `INSERT OR IGNORE INTO trip_day_type (id, created_at, updated_at, source, trip_id, day_type_id) VALUES ('seed-tdt-${hour}-${min}-sun', ${t}, ${t}, 'official', '${tripId}', 'seed-dt-sun');`,
        `INSERT OR IGNORE INTO stop_time (id, created_at, updated_at, source, trip_id, pattern_stop_id, service_minute, origin) VALUES ('seed-st-${hour}-${min}-1', ${t}, ${t}, 'official', '${tripId}', 'seed-ps-1', ${serviceMinute}, 'official');`,
        `INSERT OR IGNORE INTO stop_time (id, created_at, updated_at, source, trip_id, pattern_stop_id, service_minute, origin) VALUES ('seed-st-${hour}-${min}-2', ${t}, ${t}, 'official', '${tripId}', 'seed-ps-2', ${serviceMinute + 15}, 'official');`,
        `INSERT OR IGNORE INTO stop_time (id, created_at, updated_at, source, trip_id, pattern_stop_id, service_minute, origin) VALUES ('seed-st-${hour}-${min}-3', ${t}, ${t}, 'official', '${tripId}', 'seed-ps-3', ${serviceMinute + 30}, 'official');`,
      );
    }
  }

  // 8. Lugares e Atalhos (Casa e Facul)
  sqls.push(
    `INSERT OR IGNORE INTO place (id, created_at, updated_at, source, name, icon, is_shortcut, shortcut_order, lat, lon) VALUES ('seed-place-casa', ${t}, ${t}, 'user', 'Casa', 'house', 1, 1, 39.7500, -8.8000);`,
    `INSERT OR IGNORE INTO place (id, created_at, updated_at, source, name, icon, is_shortcut, shortcut_order, lat, lon) VALUES ('seed-place-facul', ${t}, ${t}, 'user', 'Facul', 'graduation-cap', 1, 2, 39.7350, -8.8120);`,
    `INSERT OR IGNORE INTO route (id, created_at, updated_at, source, origin_place_id, destination_place_id) VALUES ('seed-route-facul', ${t}, ${t}, 'user', 'seed-place-casa', 'seed-place-facul');`,
    `INSERT OR IGNORE INTO option (id, created_at, updated_at, source, route_id, kind, board_pattern_stop_id, alight_pattern_stop_id, sort) VALUES ('seed-opt-facul', ${t}, ${t}, 'user', 'seed-route-facul', 'bus', 'seed-ps-1', 'seed-ps-2', 1);`,
    `INSERT OR IGNORE INTO walk_time (id, created_at, updated_at, source, stop_id, place_id, minutes_min, minutes_max, origin) VALUES ('seed-wt-1', ${t}, ${t}, 'user', 'seed-stop-arrabalde', 'seed-place-casa', 5, 8, 'manual');`,
    `INSERT OR IGNORE INTO walk_time (id, created_at, updated_at, source, stop_id, place_id, minutes_min, minutes_max, origin) VALUES ('seed-wt-2', ${t}, ${t}, 'user', 'seed-stop-facul', 'seed-place-facul', 3, 5, 'manual');`,
  );

  // 9. Configurações: primeiro uso concluído e ponto recente
  sqls.push(
    `INSERT OR IGNORE INTO setting (id, created_at, updated_at, source, key, value) VALUES ('seed-set-first-run', ${t}, ${t}, 'user', 'first_run_done', 'true');`,
    `INSERT OR IGNORE INTO setting (id, created_at, updated_at, source, key, value) VALUES ('seed-set-recent', ${t}, ${t}, 'user', 'recent_stops', '["seed-stop-arrabalde"]');`,
  );

  return sqls;
}

/**
 * Executa o seed no banco de dados fornecido de forma idempotente.
 */
export async function seedTestDatabase(executor: SqlExecutor, now = SEED_TIMESTAMP): Promise<void> {
  const statements = buildTestSeedSql(now);
  const combined = statements.join("\n");

  if (typeof executor.execAsync === "function") {
    await executor.execAsync(combined);
  } else if (typeof executor.exec === "function") {
    await executor.exec(combined);
  } else if (typeof executor.execSync === "function") {
    executor.execSync(combined);
  } else {
    throw new Error("SqlExecutor inválido: nenhum método exec encontrado.");
  }
}

/**
 * Ponto de entrada chamado em apps/mobile/index.ts.
 * Se EXPO_PUBLIC_NB_TEST_SEED=1, garante abertura, migrações e seed da base.
 */
export async function runTestSeedIfNeeded(): Promise<boolean> {
  if (!isTestSeedEnabled()) return false;
  try {
    const { openNotebusDb } = await import("./open");
    const { db } = await openNotebusDb();
    await seedTestDatabase({
      execAsync: (sql) => db.$client.execAsync(sql),
    });
    return true;
  } catch (err) {
    console.warn("Falha ao rodar testSeed:", err);
    return false;
  }
}
