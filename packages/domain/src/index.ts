/** Arquivo principal de exportação do pacote de domínio. */
/**
 * Ponto de entrada do pacote de domínio.
 * Agrupa e exporta funções de utilidade e regras de negócio essenciais.
 */
export { formatServiceMinute } from "./serviceMinute";
export { OFFICIAL_ID_NAMESPACE, officialId, sha1Hex, uuidv5, uuidv7 } from "./ids";
export { SeedFormatError, parseSeedFile } from "./seedFormat";
export type { DayTypeCode, SeedFile } from "./seedFormat";
export {
  checkBusOption,
  checkObservationInterval,
  checkPatternPositions,
  checkTripTimes,
} from "./invariants";
