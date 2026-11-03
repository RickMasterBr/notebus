import { describe, expect, it } from "vitest";
import { generateSeed } from "./generate.ts";
import { formatReport } from "./report.ts";
import type { GenerateResult, GtfsFeed, NetworkConfig } from "./types.ts";

const CUT = "2026-11-01";
const WEEK = ["1", "1", "1", "1", "1", "0", "0"];

const trip = (viagem: string, h: string[]) => ["s1", "s2", "s3"].map((parada, i) => ({ viagem, parada, sequencia: i + 1, hora: h[i]!, controle: true }));
const feed: GtfsFeed = {
  info: { versao: "t", inicio: "20260101", fim: "20270131" },
  rotas: [{ id: "R1", nomeCurto: "1" }, { id: "R9", nomeCurto: "9" }],
  viagens: [
    { id: "t1", rota: "R1", servico: "A-U", direcao: "0" },
    { id: "t2", rota: "R1", servico: "JA-U", direcao: "0" },
  ],
  horarios: [...trip("t1", ["08:00:00", "08:10:00", "08:20:00"]), ...trip("t2", ["10:00:00", "10:10:00", "10:20:00"])],
  paradas: ["s1", "s2", "s3"].map((id, i) => ({ id, codigo: `G${i + 1}`, nome: `Parada ${id}`, lat: 39.7 + i / 100, lon: -8.8 })),
  calendario: ["A-U", "JA-U"].map((servico) => ({ servico, dias: WEEK, inicio: "20260101", fim: "20270131" })),
  excecoes: [{ servico: "A-U", data: "20261118", tipo: "2" }],
};
const config: NetworkConfig = {
  network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
  datasetName: "exemplo",
  lines: [{ number: "1", name: "Linha Um", color: "#111111" }],
  patterns: [{ routeId: "R1", code: "L1-s1", line: "1", label: "Ida", isCircular: false }],
  stops: [],
  holidays: [],
};
const result = generateSeed(feed, config, CUT);
const failed: GenerateResult = { ok: false, errors: [{ code: "ROTA_AUSENTE", message: "sem rota", items: ["L2: R7"] }], warnings: [] };

const SECTIONS = ["== Resumo ==", "== Percursos ==", "== Avisos e erros ==", "== Exceções de data ==", "== Pontos novos fora da tabela =="];
const verdicts = [
  { code: "L1-s1", status: "kept" as const },
  { code: "L2-s1", status: "changed" as const, reasons: ["pontos", "controle"] },
  { code: "L3-s1", status: "new" as const },
  { code: "L4-s1", status: "removed" as const },
];

describe("formatReport", () => {
  const text = formatReport({ cutoff: CUT, result, verdicts, previousVersion: "2026-09-01", tableKeys: [] });

  it("traz as seções na ordem fixa", () => {
    const at = SECTIONS.map((s) => text.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("é igual em duas chamadas e não tem data nem hora de geração", () => {
    expect(formatReport({ cutoff: CUT, result, verdicts, previousVersion: "2026-09-01", tableKeys: [] })).toBe(text);
    expect(text).not.toMatch(/\d{2}:\d{2}/);
    expect(text).not.toContain(new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0") + "T");
    expect(text).not.toMatch(/gerado em/i);
  });

  it("resumo com contagens, coordenadas e anterior", () => {
    expect(text).toContain("viagens: 2");
    expect(text).toContain("pontos: 3 (com coordenada: 3)");
    expect(text).toContain("arquivo anterior: 2026-09-01");
  });

  it("percursos mantidos, mudados com motivo, novos e removidos", () => {
    expect(text).toContain("mantidos (1): L1-s1");
    expect(text).toContain("mudados (1): L2-s1 [pontos, controle]");
    expect(text).toContain("novos (1): L3-s1");
    expect(text).toContain("removidos (1): L4-s1");
  });

  it("avisos com seus itens (ROTA_IGNORADA) e exceções de data por serviço", () => {
    expect(text).toContain("AVISO ROTA_IGNORADA");
    expect(text).toContain("  - R9");
    expect(text).toContain("weekday, sem época: notOn");
    expect(text).toContain("2026-11-18");
    expect(text).toContain("weekday, época include 07-01 a 08-31");
  });

  it("pontos fora da tabela: todos quando a tabela é vazia, nenhum quando a tabela os traz", () => {
    expect(text).toContain("mobilis/stop/G1 (Parada s1)");
    const all = result.ok ? result.seed.stops.map((s) => s.key) : [];
    expect(formatReport({ cutoff: CUT, result, verdicts: null, previousVersion: null, tableKeys: all })).toMatch(/== Pontos novos fora da tabela ==\nnenhum\n$/);
  });

  it("sem arquivo anterior diz que nada foi reaproveitado; com erro lista o erro e não tem contagens", () => {
    const noPrev = formatReport({ cutoff: CUT, result, verdicts: null, previousVersion: null });
    expect(noPrev).toContain("sem arquivo anterior: nenhum percurso reaproveitado");
    expect(noPrev).toContain("arquivo anterior: nenhum");
    const bad = formatReport({ cutoff: CUT, result: failed, verdicts: null, previousVersion: null });
    expect(bad).toContain("resultado: com erros, nada foi escrito");
    expect(bad).toContain("ERRO ROTA_AUSENTE");
    expect(bad).toContain("  - L2: R7");
    expect(bad).not.toContain("viagens:");
  });
});
