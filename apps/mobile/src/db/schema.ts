/**
 * Esquema do banco do MVP (E-01 §4). Convenções da P-03 (C1–C6) e ADR-0002:
 * - Toda tabela tem as colunas comuns da §4.2; tabelas de rede e programação têm `official_key` único.
 * - Instantes em epoch ms UTC; datas de serviço 'YYYY-MM-DD'; horas de serviço em minutos (D-016).
 * - Sem trigger, view ou CHECK (C5): as regras ficam no domínio (`@notebus/domain`, invariantes).
 * - Mudou algo aqui? `npm run db:generate -w @notebus/mobile` gera a migração. Só mudanças aditivas (§6).
 */
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export type Source = "user" | "official" | "official_edited";

/** Colunas comuns (§4.2). */
const common = () => ({
  id: text("id").primaryKey(), // UUIDv7 (aparelho) ou UUIDv5 do official_key (D-086)
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"), // exclusão lógica (C2)
  source: text("source", { enum: ["user", "official", "official_edited"] }).notNull(),
});

/**
 * Colunas comuns + `official_key` (nulo nos dados criados por você).
 * Funções, não objetos: cada tabela precisa de colunas novas, senão o drizzle repete o nome do índice único.
 */
const officialCommon = () => ({
  ...common(),
  officialKey: text("official_key").unique(),
});

// ─── §4.3 Rede (o que existe) ────────────────────────────────────────────────

export const network = sqliteTable("network", {
  ...officialCommon(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(), // Europe/Lisbon (RNF-07)
});

/** Um arquivo da MOBILIS importado. Uma linha por importação. */
export const dataset = sqliteTable("dataset", {
  ...common(),
  networkId: text("network_id").notNull(),
  name: text("name").notNull(), // "mobilis"
  version: text("version").notNull(), // "2026-09-01"
  importedAt: integer("imported_at").notNull(),
  checksum: text("checksum").notNull(),
});

/** Ponto físico (D-015). */
export const stop = sqliteTable("stop", {
  ...officialCommon(),
  networkId: text("network_id").notNull(),
  name: text("name").notNull(),
  aliases: text("aliases", { mode: "json" }).$type<string[]>().notNull().default([]),
  externalId: text("external_id"), // o ID do Google, ex.: "3479"
  lat: real("lat"), // vazio no MVP (P-14)
  lon: real("lon"),
  note: text("note"),
});

export const line = sqliteTable("line", {
  ...officialCommon(),
  networkId: text("network_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(), // cor da 4.3
});

export const pattern = sqliteTable("pattern", {
  ...officialCommon(),
  lineId: text("line_id").notNull(),
  label: text("label").notNull(), // "sentido Estação"
  isCircular: integer("is_circular", { mode: "boolean" }).notNull().default(false),
});

/** Unidade de tudo que é horário (Fase 1). */
export const patternStop = sqliteTable(
  "pattern_stop",
  {
    ...officialCommon(),
    patternId: text("pattern_id").notNull(),
    position: integer("position").notNull(), // 1…n (invariante 1)
    stopId: text("stop_id").notNull(),
    isTimepoint: integer("is_timepoint", { mode: "boolean" }).notNull().default(false),
    timepointLabel: text("timepoint_label"),
  },
  (t) => [unique("pattern_stop_pattern_position").on(t.patternId, t.position)],
);

// ─── §4.4 Programação (o que deveria acontecer) ──────────────────────────────

export const dayType = sqliteTable("day_type", {
  ...officialCommon(),
  networkId: text("network_id").notNull(),
  code: text("code").notNull(), // weekday, saturday, sunday_holiday
  name: text("name").notNull(),
  sort: integer("sort").notNull(),
});

/** Só o municipal e os manuais; os nacionais vêm do date-holidays na hora (P-07). */
export const holiday = sqliteTable("holiday", {
  ...officialCommon(),
  networkId: text("network_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  name: text("name").notNull(),
  scope: text("scope", { enum: ["national", "municipal"] }).notNull(),
});

/** "Hoje funciona como sábado". */
export const dateOverride = sqliteTable("date_override", {
  ...officialCommon(),
  networkId: text("network_id").notNull(),
  date: text("date").notNull(),
  dayTypeId: text("day_type_id").notNull(),
  note: text("note"),
});

export const season = sqliteTable("season", {
  ...officialCommon(),
  networkId: text("network_id").notNull(),
  name: text("name").notNull(),
  startMd: text("start_md").notNull(), // "07-01"
  endMd: text("end_md").notNull(), // "08-31"
  mode: text("mode", { enum: ["include", "exclude"] }).notNull(),
});

/** Tabela nova não apaga a antiga: a antiga ganha `valid_to`. */
export const timetable = sqliteTable("timetable", {
  ...officialCommon(),
  patternId: text("pattern_id").notNull(),
  datasetId: text("dataset_id"), // vazio numa tabela criada por você
  validFrom: text("valid_from").notNull(), // YYYY-MM-DD
  validTo: text("valid_to"),
});

/** Viagem parcial = first/last diferentes das pontas. */
export const trip = sqliteTable("trip", {
  ...officialCommon(),
  timetableId: text("timetable_id").notNull(),
  firstPosition: integer("first_position").notNull(),
  lastPosition: integer("last_position").notNull(),
  seasonId: text("season_id"),
  frequencyId: text("frequency_id"), // viagem gerada por uma frequência (E-08)
});

export const tripDayType = sqliteTable("trip_day_type", {
  ...officialCommon(),
  tripId: text("trip_id").notNull(),
  dayTypeId: text("day_type_id").notNull(),
});

export const stopTime = sqliteTable("stop_time", {
  ...officialCommon(),
  tripId: text("trip_id").notNull(),
  patternStopId: text("pattern_stop_id").notNull(),
  serviceMinute: integer("service_minute").notNull(), // pode passar de 1440 (D-016)
  origin: text("origin", { enum: ["official", "declared"] }).notNull(),
});

/** Atalho de cadastro (E-08). Gera viagens. */
export const frequency = sqliteTable("frequency", {
  ...officialCommon(),
  patternId: text("pattern_id").notNull(),
  refPatternStopId: text("ref_pattern_stop_id").notNull(),
  fromMinute: integer("from_minute").notNull(),
  toMinute: integer("to_minute").notNull(),
  headwayMinutes: integer("headway_minutes").notNull(),
});

export const frequencyDayType = sqliteTable("frequency_day_type", {
  ...officialCommon(),
  frequencyId: text("frequency_id").notNull(),
  dayTypeId: text("day_type_id").notNull(),
});

// ─── §4.5 Realidade (o que aconteceu) ────────────────────────────────────────

/**
 * Um registro seu. Dois grupos separados (D-085):
 * - FATO: o que você disse. Só muda se você editar.
 * - DEDUÇÃO: o que o app concluiu. Recalculável a qualquer momento; vazio = ainda não deduzido.
 *   `match_status = 'manual'` (você escolheu na TL-09) nunca é recalculado.
 */
export const observation = sqliteTable("observation", {
  ...common(),

  // FATO
  stopId: text("stop_id").notNull(),
  lineId: text("line_id").notNull(),
  observedAt: integer("observed_at").notNull(), // epoch ms UTC, com segundos
  observedEndAt: integer("observed_end_at"), // fim do intervalo (máx. 30 min, invariante 4)
  kind: text("kind", { enum: ["boarded", "passed", "alighted"] }).notNull(),
  mode: text("mode", { enum: ["live", "later", "memory"] }).notNull(),
  rideId: text("ride_id"),
  note: text("note"),
  recordedAt: integer("recorded_at").notNull(), // quando você tocou no botão
  gpsLat: real("gps_lat"), // só com permissão (RNF-05)
  gpsLon: real("gps_lon"),
  gpsAccuracyM: real("gps_accuracy_m"),

  // DEDUÇÃO
  serviceDate: text("service_date"), // YYYY-MM-DD no fuso da rede (D-016)
  serviceMinute: integer("service_minute"),
  patternStopId: text("pattern_stop_id"), // qual passagem (D-021, D-071)
  tripId: text("trip_id"),
  matchStatus: text("match_status", { enum: ["auto", "manual", "ambiguous", "orphan"] }),
  deviationMin: real("deviation_min"),
  matchRuleVersion: integer("match_rule_version"),

  // CONFERÊNCIA
  reviewDismissedAt: integer("review_dismissed_at"), // "Não sei" na TL-09 (D-057)
});

/** Uma viagem sua: liga embarque e descida. */
export const ride = sqliteTable("ride", {
  ...common(),
  boardingObservationId: text("boarding_observation_id").notNull(),
  alightingObservationId: text("alighting_observation_id"), // vazio até descer
  tripId: text("trip_id"), // dedução
  status: text("status", { enum: ["open", "closed", "dismissed"] }).notNull(),
});

// ─── §4.6 Intenção (o que você quer) ─────────────────────────────────────────

export const place = sqliteTable("place", {
  ...common(),
  name: text("name").notNull(),
  icon: text("icon"),
  lat: real("lat"),
  lon: real("lon"),
  isShortcut: integer("is_shortcut", { mode: "boolean" }).notNull().default(false),
  shortcutOrder: integer("shortcut_order"),
});

/** D-069: um por par ponto ↔ lugar; vale nos dois sentidos (D-087). */
export const walkTime = sqliteTable(
  "walk_time",
  {
    ...common(),
    stopId: text("stop_id").notNull(),
    placeId: text("place_id").notNull(),
    minutesMin: integer("minutes_min").notNull(),
    minutesMax: integer("minutes_max"), // vazio = sem faixa
    origin: text("origin", { enum: ["manual", "computed"] }).notNull(),
  },
  (t) => [unique("walk_time_stop_place").on(t.stopId, t.placeId)],
);

export const route = sqliteTable("route", {
  ...common(),
  originPlaceId: text("origin_place_id").notNull(),
  destinationPlaceId: text("destination_place_id").notNull(),
});

export const option = sqliteTable("option", {
  ...common(),
  routeId: text("route_id").notNull(),
  kind: text("kind", { enum: ["bus", "walk"] }).notNull(),
  boardPatternStopId: text("board_pattern_stop_id"), // só em `bus`
  alightPatternStopId: text("alight_pattern_stop_id"),
  walkMinutes: integer("walk_minutes"), // só em `walk`
  sort: integer("sort").notNull(),
});

/** Margem, rede ativa, data do último backup exportado (D-082). */
export const setting = sqliteTable("setting", {
  ...common(),
  key: text("key").notNull().unique(),
  value: text("value", { mode: "json" }).notNull(),
});

/** Todas as tabelas, na ordem do plano. */
export const tables = {
  network, dataset, stop, line, pattern, patternStop,
  dayType, holiday, dateOverride, season, timetable, trip, tripDayType, stopTime, frequency, frequencyDayType,
  observation, ride,
  place, walkTime, route, option, setting,
};
