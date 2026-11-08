import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ptBR } from "../i18n/pt-BR";

const SHEETS_DIR = __dirname;
const MOBILE_SRC = join(SHEETS_DIR, "..");

function read(relative: string): string {
  return readFileSync(join(MOBILE_SRC, relative), "utf-8");
}

describe("tripCardHomeWiring (D-413): o cartão do Início abre a Tela de viagem e desce num toque", () => {
  it("HomeSheet.tsx liga o cartão ao tripCardHome e ao alight do provedor, sem abrir folha", () => {
    const code = read("sheets/HomeSheet.tsx");

    expect(code).toContain("tripCardHome(");
    expect(code).toContain("alightRecordTime(");
    expect(code).toContain("useTripAlightChoice(");
    expect(code).toContain("useNowTick(");
    expect(code).toMatch(/summary=\{home \? \{ etaText: home\.etaText, nextLine: home\.nextLine \} : undefined\}/);
    expect(code).toContain("void alight(");
    expect(code).not.toContain('kind: "alight"');
  });

  it("tocar no cartão abre a Tela de viagem com push de trip", () => {
    const code = read("sheets/HomeSheet.tsx");

    expect(code).toMatch(/onOpenList=\{\(\) => dispatch\(\{ type: "push", sheet: \{ kind: "trip" \} \}\)\}/);
  });

  it("TripCard.tsx usa a prop summary e a dica nova", () => {
    const code = read("ui/TripCard.tsx");

    expect(code).toContain("summary?: { etaText: string | null; nextLine: string | null }");
    expect(code).toContain("summary.etaText");
    expect(code).toContain("summary?.nextLine");
    expect(code).toContain('t("home.trip.a11y.open_trip")');
  });

  it("a chave nova existe no catálogo e a antiga fica (o 09 limpa)", () => {
    expect(ptBR["home.trip.a11y.open_trip"]).toBe("Abre a viagem");
    expect(ptBR["home.trip.a11y.open_list"]).toBeTruthy();
  });
});
