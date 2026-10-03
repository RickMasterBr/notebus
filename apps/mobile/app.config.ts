import type { ConfigContext, ExpoConfig } from "expo/config";
import { applyVariant, parseVariant } from "./appVariant.ts";

/** O `app.json` continua sendo a fonte; aqui só se aplica a variante (`NOTEBUS_VARIANT=dev`). */
export default ({ config }: ConfigContext): ExpoConfig => applyVariant(config as ExpoConfig, parseVariant(process.env.NOTEBUS_VARIANT));
