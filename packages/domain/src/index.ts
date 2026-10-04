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
  checkTripTimes,
} from "./invariants";
export {
  addDays,
  dayOfWeek,
  dayTypeOf,
  lineServiceOn,
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
export { DOMAIN_CONFIG } from "./config";
export type { DomainConfig } from "./config";
export { ageDays, recordWeight, weightedQuantile } from "./estimate";
export type { WeightInput } from "./estimate";
export { deduceObservation, matchInstant, matchObservation, normalizedDistance } from "./matching";
export type { Deduction, LinePatternData, MatchCandidate, MatchNetwork, MatchResult, ObservationFact, OngoingRide } from "./matching";
export { alightRide, boardWithOpenRides, dismissRide, expireRide, notBoarded, openRide, rideExpired } from "./ride";
export type { RidePoint, RideState, RideStatus } from "./ride";
