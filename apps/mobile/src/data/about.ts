/**
 * Decisões puras da página Ajustes › Sobre (plano E-09 §3.7): as versões, os créditos exigidos por licença, o link do
 * código e o aviso honesto, tudo por campo; e as linhas da lista de licenças gerada (T-90).
 * Sem React: o componente (`sheets/AboutPage.tsx`) só renderiza estes campos.
 */
import { t } from "../i18n";

/** O repositório público do código (`git remote get-url origin`, sem o `.git`). */
export const REPO_URL = "https://github.com/RickMasterBr/notebus";

export interface AboutInput {
  /** `appJson.expo.version` mais o código da compilação (o mesmo texto da linha Versão de Ajustes). */
  appVersion: string;
  /** `PRAGMA user_version` (`schemaVersion` de `db/backup.ts`); `null` até a leitura terminar. */
  schemaVersion: number | null;
  /** `installedDatasets` de `db/backup.ts`; `null` até a leitura terminar. */
  datasets: { name: string; version: string }[] | null;
}

export interface AboutView {
  appVersion: string;
  schemaVersion: string;
  dataVersion: string;
  creditHolidays: string;
  creditMap: string;
  repoUrl: string;
  noticeLines: string[];
}

export function aboutView(input: AboutInput): AboutView {
  const datasets = input.datasets ?? [];
  return {
    appVersion: input.appVersion,
    schemaVersion: input.schemaVersion === null ? "–" : String(input.schemaVersion),
    dataVersion:
      input.datasets === null
        ? "–"
        : datasets.length === 0
          ? t("settings.about.data_none")
          : datasets.map((d) => `${d.name} ${d.version}`).join(", "),
    creditHolidays: t("settings.about.credit.holidays"),
    creditMap: t("settings.about.credit.map"),
    repoUrl: REPO_URL,
    noticeLines: [
      t("settings.about.notice.not_mobilis"),
      t("settings.about.notice.times"),
      t("settings.about.notice.brand"),
    ],
  };
}

export interface LicenseRow {
  key: string;
  title: string;
  detail: string;
}

/** `licenses.generated.json` → uma linha por pacote: "react 19.2.3" e a licença embaixo. */
export function licenseRows(packages: readonly { name: string; version: string; license: string }[]): LicenseRow[] {
  return packages.map((p) => ({ key: `${p.name}@${p.version}`, title: `${p.name} ${p.version}`, detail: p.license }));
}
