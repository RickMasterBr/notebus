/**
 * Traçados das linhas: lê o feed (CSV), escolhe o `shape_id` da maior variante de cada rota,
 * simplifica (Douglas-Peucker, 5 m) e serializa. Só funções puras; nada vai para o app nem para o banco.
 */

export type Row = Record<string, string>;

export const TOLERANCIA_M = 5;

export type CodigoProblema = "ROTA_SEM_VIAGENS" | "ROTA_SEM_FORMA" | "FORMA_EMPATADA" | "FORMA_AUSENTE";
export interface Problema {
  codigo: CodigoProblema;
  rota: string;
  detalhe?: string;
}
export interface Escolha {
  rota: string;
  linha: string;
  forma: string;
}
export interface ResultadoEscolha {
  escolhas: Escolha[];
  avisos: Problema[];
  erros: Problema[];
}

export class TracadoErro extends Error {
  readonly codigo: "FORMA_INVALIDA" | "FORMA_CURTA";
  constructor(codigo: "FORMA_INVALIDA" | "FORMA_CURTA", mensagem: string) {
    super(`${codigo}: ${mensagem}`);
    this.codigo = codigo;
  }
}

export type Ponto = [number, number];
export interface Forma extends Escolha {
  pontos: Ponto[];
}

/** C1: CSV do feed → registros por nome de coluna. */
export function parseCsv(texto: string): Row[] {
  const src = texto.replace(/^﻿/, "");
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  const fechaLinha = () => {
    linha.push(campo);
    campo = "";
    // linha em branco = um único campo vazio
    if (!(linha.length === 1 && linha[0] === "")) linhas.push(linha);
    linha = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (aspas) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\r") {
      if (src[i + 1] === "\n") i++;
      fechaLinha();
    } else if (c === "\n") fechaLinha();
    else campo += c;
  }
  if (campo !== "" || linha.length > 0) fechaLinha();
  const [cab, ...resto] = linhas;
  if (!cab) return [];
  return resto.map((l) => Object.fromEntries(cab.map((nome, i) => [nome, l[i] ?? ""])));
}

const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** C2: o `shape_id` da maior variante (mais paradas) de cada rota, o mais frequente entre as viagens dela. */
export function chooseShapes(routes: Row[], trips: Row[], stopTimes: Row[], shapes: Row[]): ResultadoEscolha {
  const paradas = new Map<string, number>();
  for (const st of stopTimes) paradas.set(st.trip_id!, (paradas.get(st.trip_id!) ?? 0) + 1);
  const existentes = new Set(shapes.map((s) => s.shape_id));
  const ordenadas = [...routes].sort((a, b) => natural(a.route_short_name!, b.route_short_name!) || natural(a.route_id!, b.route_id!));
  const r: ResultadoEscolha = { escolhas: [], avisos: [], erros: [] };
  for (const rota of ordenadas) {
    const id = rota.route_id!;
    const viagens = trips.filter((t) => t.route_id === id);
    if (viagens.length === 0) {
      r.avisos.push({ codigo: "ROTA_SEM_VIAGENS", rota: id });
      continue;
    }
    const maior = Math.max(...viagens.map((t) => paradas.get(t.trip_id!) ?? 0));
    const freq = new Map<string, number>();
    for (const t of viagens) {
      if ((paradas.get(t.trip_id!) ?? 0) === maior && t.shape_id) freq.set(t.shape_id, (freq.get(t.shape_id) ?? 0) + 1);
    }
    if (freq.size === 0) {
      r.avisos.push({ codigo: "ROTA_SEM_FORMA", rota: id });
      continue;
    }
    const topo = Math.max(...freq.values());
    const vencedoras = [...freq].filter(([, n]) => n === topo).map(([s]) => s);
    if (vencedoras.length > 1) {
      r.erros.push({ codigo: "FORMA_EMPATADA", rota: id, detalhe: vencedoras.join(",") });
      continue;
    }
    const forma = vencedoras[0]!;
    if (!existentes.has(forma)) {
      r.erros.push({ codigo: "FORMA_AUSENTE", rota: id, detalhe: forma });
      continue;
    }
    r.escolhas.push({ rota: id, linha: rota.route_short_name!, forma });
  }
  return r;
}

function numero(s: string | undefined, min: number, max: number, nome: string): number {
  const n = s === undefined || s.trim() === "" ? NaN : Number(s);
  if (!Number.isFinite(n) || n < min || n > max) throw new TracadoErro("FORMA_INVALIDA", `${nome} inválido: ${s}`);
  return n;
}

const arredonda = (v: number) => Math.round(v * 1e5) / 1e5;

/** C3: linhas de `shapes.txt` de UM shape_id → pontos simplificados [lat, lon]. */
export function simplifyShape(linhas: Row[]): Ponto[] {
  const lidos = linhas.map((l) => ({
    seq: numero(l.shape_pt_sequence, -Infinity, Infinity, "shape_pt_sequence"),
    lat: numero(l.shape_pt_lat, -90, 90, "lat"),
    lon: numero(l.shape_pt_lon, -180, 180, "lon"),
  }));
  lidos.sort((a, b) => a.seq - b.seq); // estável: empate mantém a ordem do arquivo
  const pts: Ponto[] = [];
  for (const p of lidos) {
    const ult = pts[pts.length - 1];
    if (!ult || ult[0] !== p.lat || ult[1] !== p.lon) pts.push([p.lat, p.lon]);
  }
  if (pts.length < 2) throw new TracadoErro("FORMA_CURTA", "menos de 2 pontos distintos");

  const kx = 111320 * Math.cos((pts.reduce((s, p) => s + p[0], 0) / pts.length) * (Math.PI / 180));
  const xy = pts.map((p) => [p[1] * kx, p[0] * 110540] as const);
  const manter = new Array<boolean>(pts.length).fill(false);
  manter[0] = manter[pts.length - 1] = true;
  const pilha: Array<[number, number]> = [[0, pts.length - 1]];
  while (pilha.length > 0) {
    const [a, b] = pilha.pop()!;
    const [ax, ay] = xy[a]!;
    const [bx, by] = xy[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const comp = Math.hypot(dx, dy);
    let maxD = -1;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]!;
      const d = comp === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dx * (ay - py) - (ax - px) * dy) / comp;
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxI >= 0 && maxD > TOLERANCIA_M) {
      manter[maxI] = true;
      pilha.push([a, maxI], [maxI, b]);
    }
  }
  return pts.filter((_, i) => manter[i]).map((p) => [arredonda(p[0]), arredonda(p[1])]);
}

/** C4: texto do arquivo, determinístico, uma forma por linha. */
export function serializeShapes(formas: Forma[]): string {
  const corpo = formas.map((f) => JSON.stringify({ rota: f.rota, linha: f.linha, forma: f.forma, pontos: f.pontos }));
  return `{"versao":1,"tolerancia_m":${TOLERANCIA_M},"formas":[\n${corpo.join(",\n")}${corpo.length ? "\n" : ""}]}\n`;
}
