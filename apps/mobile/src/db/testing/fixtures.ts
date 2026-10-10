/** Definições de estado inicial do banco (fixtures) em raw SQL para testes de migração. */
/**
 * SÓ PARA TESTE. Registros de exemplo **inventados** (nada da MOBILIS, D-091) gravados num banco
 * de cada versão, para provar que as migrações seguintes não perdem nada (§6.6).
 *
 * SQL escrito à mão, de propósito: descreve o banco como ele era naquela versão, mesmo depois que
 * `schema.ts` evoluir. Nunca edite a fixture de uma versão já publicada; crie a da versão nova.
 */
const T = 1_790_000_000_000; // Timestamp fixo para testes (epoch ms)
const c = `${T}, ${T}`; // Valores em string para "created_at, updated_at"

/** Versão 1 (0000_init): uma linha em cada uma das 23 tabelas, mais uma apagada (deleted_at). */
const v1 = [
  `INSERT INTO network (id, created_at, updated_at, source, official_key, name, timezone) VALUES ('net', ${c}, 'official', 'exemplo', 'Rede Exemplo', 'Europe/Lisbon')`,
  `INSERT INTO dataset (id, created_at, updated_at, source, network_id, name, version, imported_at, checksum) VALUES ('ds', ${c}, 'official', 'net', 'exemplo', '2026-01-01', ${T}, 'abc')`,
  `INSERT INTO stop (id, created_at, updated_at, source, official_key, network_id, name, aliases, external_id) VALUES ('stop-a', ${c}, 'official', 'exemplo/stop-a', 'net', 'Praça Inventada', '["praça"]', '9999')`,
  `INSERT INTO stop (id, created_at, updated_at, deleted_at, source, network_id, name, note) VALUES ('stop-b', ${c}, ${T}, 'user', 'net', 'Ponto Apagado', 'lado do rio')`,
  `INSERT INTO line (id, created_at, updated_at, source, official_key, network_id, code, name, color) VALUES ('line-x1', ${c}, 'official', 'exemplo/X1', 'net', 'X1', 'Linha Exemplo', '#7A3FF2')`,
  `INSERT INTO pattern (id, created_at, updated_at, source, official_key, line_id, label, is_circular) VALUES ('pat', ${c}, 'official', 'exemplo/X1/ida', 'line-x1', 'sentido Praça', 0)`,
  `INSERT INTO pattern_stop (id, created_at, updated_at, source, official_key, pattern_id, position, stop_id, is_timepoint, timepoint_label) VALUES ('ps-1', ${c}, 'official', 'exemplo/X1/ida/pos-1', 'pat', 1, 'stop-a', 1, 'Praça 1')`,
  `INSERT INTO day_type (id, created_at, updated_at, source, official_key, network_id, code, name, sort) VALUES ('dt-wd', ${c}, 'official', 'exemplo/weekday', 'net', 'weekday', 'Dia útil', 1)`,
  `INSERT INTO holiday (id, created_at, updated_at, source, network_id, date, name, scope) VALUES ('hol', ${c}, 'user', 'net', '2026-05-22', 'Feriado Inventado', 'municipal')`,
  `INSERT INTO date_override (id, created_at, updated_at, source, network_id, date, day_type_id, note) VALUES ('ovr', ${c}, 'user', 'net', '2026-12-24', 'dt-wd', 'ponte')`,
  `INSERT INTO season (id, created_at, updated_at, source, official_key, network_id, name, start_md, end_md, mode) VALUES ('sea', ${c}, 'official', 'exemplo/verao', 'net', 'Verão', '07-01', '08-31', 'exclude')`,
  `INSERT INTO timetable (id, created_at, updated_at, source, official_key, pattern_id, dataset_id, valid_from) VALUES ('tt', ${c}, 'official', 'exemplo/X1/ida/tt', 'pat', 'ds', '2026-01-01')`,
  `INSERT INTO trip (id, created_at, updated_at, source, official_key, timetable_id, first_position, last_position, season_id) VALUES ('trip', ${c}, 'official', 'exemplo/X1/ida/0810', 'tt', 1, 1, 'sea')`,
  `INSERT INTO trip_day_type (id, created_at, updated_at, source, trip_id, day_type_id) VALUES ('tdt', ${c}, 'official', 'trip', 'dt-wd')`,
  `INSERT INTO stop_time (id, created_at, updated_at, source, trip_id, pattern_stop_id, service_minute, origin) VALUES ('st', ${c}, 'official', 'trip', 'ps-1', 1450, 'official')`,
  `INSERT INTO frequency (id, created_at, updated_at, source, pattern_id, ref_pattern_stop_id, from_minute, to_minute, headway_minutes) VALUES ('freq', ${c}, 'user', 'pat', 'ps-1', 400, 1180, 30)`,
  `INSERT INTO frequency_day_type (id, created_at, updated_at, source, frequency_id, day_type_id) VALUES ('fdt', ${c}, 'user', 'freq', 'dt-wd')`,
  `INSERT INTO observation (id, created_at, updated_at, source, stop_id, line_id, observed_at, observed_end_at, kind, mode, ride_id, note, recorded_at, gps_lat, gps_lon, gps_accuracy_m, service_date, service_minute, pattern_stop_id, trip_id, match_status, deviation_min, match_rule_version, review_dismissed_at) VALUES ('obs', ${c}, 'user', 'stop-a', 'line-x1', ${T}, ${T + 300_000}, 'boarded', 'live', 'ride', 'chovia', ${T}, 39.7, -8.8, 12.5, '2026-09-21', 490, 'ps-1', 'trip', 'auto', 2.5, 1, ${T})`,
  `INSERT INTO ride (id, created_at, updated_at, source, boarding_observation_id, status) VALUES ('ride', ${c}, 'user', 'obs', 'open')`,
  `INSERT INTO place (id, created_at, updated_at, source, name, icon, is_shortcut, shortcut_order) VALUES ('home', ${c}, 'user', 'Casa', 'house', 1, 1)`,
  `INSERT INTO walk_time (id, created_at, updated_at, source, stop_id, place_id, minutes_min, minutes_max, origin) VALUES ('wt', ${c}, 'user', 'stop-a', 'home', 10, 12, 'manual')`,
  `INSERT INTO route (id, created_at, updated_at, source, origin_place_id, destination_place_id) VALUES ('rt', ${c}, 'user', 'home', 'home')`,
  `INSERT INTO option (id, created_at, updated_at, source, route_id, kind, walk_minutes, sort) VALUES ('opt', ${c}, 'user', 'rt', 'walk', 25, 1)`,
  `INSERT INTO setting (id, created_at, updated_at, source, key, value) VALUES ('set', ${c}, 'user', 'margin_minutes', '2')`,
];

/** Versão 2 (0001, E-06): as linhas da v1 mais um aviso de saída e um evento do aviso (as duas tabelas novas). */
const v2 = [
  ...v1,
  `INSERT INTO departure_alarm (id, created_at, updated_at, source, option_id, anchor_trip_id, anchor_base_minute, weekdays, once_date, valid_from, valid_to, enabled) VALUES ('alarm', ${c}, 'user', 'opt', 'trip', 492, '[1,3,5]', NULL, '2026-10-01', '2027-01-31', 1)`,
  `INSERT INTO alarm_event (id, created_at, updated_at, source, alarm_id, planned_at, service_date, trip_id, state, skip_reason, acted_at, snoozed_to) VALUES ('alarm-ev', ${c}, 'user', 'alarm', ${T}, '2026-10-07', 'trip', 'boarded', NULL, ${T + 5_000}, NULL)`,
];

/**
 * Versão 3 (0002, E-07): as linhas da v2 mais pontos com localização, um com coordenada oficial da rede (`location_source`
 * vazio) e um com localização guardada pelo uso (`suggested`).
 */
const v3 = [
  ...v2,
  `INSERT INTO stop (id, created_at, updated_at, source, official_key, network_id, name, lat, lon) VALUES ('stop-c', ${c}, 'official', 'exemplo/stop-c', 'net', 'Largo Inventado', 39.7, -8.8)`,
  `INSERT INTO stop (id, created_at, updated_at, source, network_id, name, lat, lon, location_source) VALUES ('stop-d', ${c}, 'user', 'net', 'Ponto do Rick', 39.71, -8.81, 'suggested')`,
];

/**
 * Versão 4 (0003, E-08): as linhas da v3 mais um feriado cadastrado pela pessoa (`scope` manual) que repete todo ano.
 * O feriado municipal `hol` da v1 fica como está: a coluna `recurring` dele nasce 0.
 */
const v4 = [
  ...v3,
  `INSERT INTO holiday (id, created_at, updated_at, source, network_id, date, name, scope, recurring) VALUES ('hol-man', ${c}, 'user', 'net', '2026-03-03', 'Dia Inventado', 'manual', 1)`,
];

/** Fixture de cada versão, pelo número da versão (= quantas migrações reais rodaram). */
export const fixtures: Record<number, readonly string[]> = { 1: v1, 2: v2, 3: v3, 4: v4 };
