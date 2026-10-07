/** Arquivo principal de exportação do pacote de domínio. */
/**
 * Ponto de entrada do pacote de domínio.
 * Agrupa e exporta funções de utilidade e regras de negócio essenciais.
 */
export { normalizeSearch, searchStops } from "./search";
export type { SearchableStop } from "./search";
export { formatServiceMinute } from "./serviceMinute";
export { OFFICIAL_ID_NAMESPACE, officialId, sha1Hex, uuidv5, uuidv7 } from "./ids";
export { SeedFormatError, parseSeedFile } from "./seedFormat";
export type { DayTypeCode, SeedFile, SeedHoliday } from "./seedFormat";
export {
  checkBusOption,
  checkObservationInterval,
  checkPatternPositions,
  checkRide,
  checkRideCode,
  checkTripTimes,
} from "./invariants";
export type { RideProblemCode } from "./invariants";
export {
  addDays,
  dayOfWeek,
  dayTypeOf,
  lineServiceOn,
  lisbonInstants,
  lisbonWallClock,
  serviceDaysAt,
  tripsRunningOn,
} from "./calendar";
export type {
  CalendarData,
  DayTypeReason,
  DayTypeResult,
  LineService,
  NoServiceReason,
  ScheduleData,
  ScheduleTrip,
  ServiceDay,
  WallClock,
} from "./calendar";
export {
  BASE_UNCERTAINTY,
  DEFAULT_MARGIN_MINUTES,
  aheadFrom,
  baseTimeAt,
  displayBeAtStop,
  displayCenter,
  estimateDeviation,
  expectedTime,
  inRideExpected,
  latestRideDeviation,
  passageInfo,
  passagesAtStop,
  timepointPositions,
} from "./passages";
export type {
  AheadOptions,
  AheadResult,
  AheadStop,
  BaseKind,
  BaseTime,
  Confidence,
  DeviationEstimate,
  EstimateLevel,
  ExpectedTime,
  ExpectedTimeOptions,
  PassageInfo,
  MatchStatus,
  PassageRecord,
  PassageTarget,
  PatternData,
  PatternStopData,
  StopPassage,
  StopTimeData,
  TripData,
} from "./passages";
export { busCandidates, gotoCards, shrunkRideMinutes, walkTimes } from "./goto";
export type { BusCandidate, BusOption, GotoCandidate, GotoInput, WalkCandidate, WalkOption, WalkRange } from "./goto";
export { alarmTextParams, applyAlarm, buildWindow, planDepartures, resolveAlarmEventState, snoozePlan } from "./alarms";
export type {
  AlarmAction,
  AlarmDayData,
  AlarmEventInput,
  AlarmEventState,
  AlarmOption,
  AlarmReplacement,
  AlarmRule,
  ApplyAlarmResult,
  DeparturePlan,
  PlannedDeparture,
  PlanInput,
  SkipReason,
  SkippedDeparture,
  WindowDeparture,
} from "./alarms";
export { DOMAIN_CONFIG } from "./config";
export type { DomainConfig } from "./config";
export { ageDays, recordWeight, weightedQuantile } from "./estimate";
export type { WeightInput } from "./estimate";
export { deduceObservation, evaluatePassages, matchInstant, matchObservation, normalizedDistance } from "./matching";
export type { Deduction, LinePatternData, MatchCandidate, MatchNetwork, MatchResult, ObservationFact, OngoingRide } from "./matching";
export { checkAlightEdit, intervalAround, modeFor, previewMatch, resolvePickedTime, verifyOptions } from "./edit";
export type { AlightEditProblem, AlightHint, MatchPreview, VerifyContext, VerifyOptions, VerifyPassage } from "./edit";
export { alightRide, boardWithOpenRides, dismissRide, expireRide, expireRideWithoutTrip, notBoarded, openRide, rideExpired } from "./ride";
export type { RidePoint, RideState, RideStatus } from "./ride";
export {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_REMINDER_DAYS,
  BACKUP_SETTING_KEYS,
  BACKUP_SNOOZE_DAYS,
  BACKUP_TABLES,
  BACKUP_V1_COLUMNS,
  BACKUP_V2_COLUMNS,
  OFFICIAL_EDIT_TABLES,
  backupFileName,
  backupReminder,
  backupSummary,
  checksumMatches,
  countTables,
  findOrphans,
  isoSeconds,
  matchKey,
  migrateBackup,
  parseBackup,
  planMerge,
  planTableMerge,
  serializeBackup,
  snoozeUntil,
} from "./backup";
export type {
  BackupFile,
  BackupHeader,
  BackupInput,
  BackupParseResult,
  BackupProblem,
  BackupRow,
  BackupTableName,
  BackupTables,
  BackupValue,
  MergeOp,
  MergePlan,
  MergeSummary,
  Orphan,
  ParseDeps,
  ReminderInput,
  Sha256,
} from "./backup";
