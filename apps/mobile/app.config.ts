import type { ConfigContext, ExpoConfig } from "expo/config";
import { execSync } from "node:child_process";
import { applyVariant, parseVariant } from "./appVariant.ts";

let gitSha = "N/D";
try {
  const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim() ? "-dirty" : "";
  gitSha = `${sha}${dirty}`;
} catch {
  gitSha = process.env.NOTEBUS_GIT_SHA || process.env.BUILD_SHA || "N/D";
}
process.env.EXPO_PUBLIC_BUILD_SHA = gitSha;

/** O `app.json` continua sendo a fonte; aqui só se aplica a variante (`NOTEBUS_VARIANT=dev`). */
export default ({ config }: ConfigContext): ExpoConfig =>
  applyVariant(
    {
      ...config,
      plugins: [
        ...(config.plugins ?? []),
        "expo-notifications",
        "@maplibre/maplibre-react-native",
        [
          "expo-location",
          {
            locationWhenInUsePermission:
              "O NoteBus usa a sua localização para sugerir o ponto onde você está e guardar onde ficam os seus lugares e pontos.",
          },
        ],
      ],
      extra: {
        ...(config.extra as Record<string, unknown> | undefined),
        buildSha: gitSha,
      },
    } as ExpoConfig,
    parseVariant(process.env.NOTEBUS_VARIANT)
  );

