/** Arquivo principal de exportação do pacote de domínio. */
/**
 * Ponto de entrada do pacote de domínio.
 * Agrupa e exporta funções de utilidade e regras de negócio essenciais.
 */
export { formatServiceMinute } from "./serviceMinute";
export { OFFICIAL_ID_NAMESPACE, officialId, sha1Hex, uuidv5, uuidv7 } from "./ids";
export { SeedFormatError, parseSeedFile } from "./seedFormat";
export type { DayTypeCode, SeedFile, SeedHoliday } from "./seedFormat";
export {
  checkBusOption,
  checkObservationInterval,
  checkPatternPositions,
  checkTripTimes,
} from "./invariants";
export {
  addDays,
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
