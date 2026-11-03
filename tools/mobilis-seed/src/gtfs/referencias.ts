/**
 * Relatório das referências pessoais que a troca de vigência afeta, lido de um backup (só leitura).
 * Opções de ônibus, avisos, viagens e horários do usuário e registros: o que a passagem (ponto + ordem, `samePassage`)
 * traduz para o arquivo novo e o que não. Sem nome de lugar na saída: só id, código de percurso, chave de ponto e números.
 */
import { baseTimeAt, type PatternData, type TripData } from "@notebus/domain/src/passages.ts";
import { samePassage } from "@notebus/domain/src/samePassage.ts";
import type { SeedFile } from "./types.ts";

export type Row = Record<string, unknown>;
export type BackupTables = Record<string, Row[]>;

export type Motivo = "percurso_ausente" | "ponto_fora" | "passagem_ausente";
export type ClasseOpcao = "resolve" | "mantida" | "nao_resolve" | "fora_do_arquivo";

export interface OpcaoRef {
  id: string;
  classe: ClasseOpcao;
  motivo: Motivo | null;
  codigo: string | null;
  chaveEmbarque: string | null;
  ordemEmbarque: number | null;
  ordemDescida: number | null;
  embarque: number | null;
  embarqueNovo: number | null;
  descida: number | null;
  descidaNova: number | null;
}

export type Ancora = { tipo: "ok" } | { tipo: "sem_viagem"; abaixo: number | null; acima: number | null } | { tipo: "opcao_nao_resolve" };

export interface AvisoRef {
  id: string;
  opcaoId: string;
  classeOpcao: ClasseOpcao | "ausente";
  enabled: unknown;
  weekdays: unknown;
  onceDate: unknown;
  validFrom: unknown;
  validTo: unknown;
  ancora: Ancora;
}

export interface ContagemPercurso {
  codigo: string;
  total: number;
  traduz: number;
  naoTraduz: number;
}

export interface Referencias {
  opcoes: OpcaoRef[];
  avisos: AvisoRef[];
  viagensUsuario: { codigo: string; n: number }[];
  declarados: { codigo: string; n: number }[];
  registros: ContagemPercurso[];
  podeImportar: boolean;
  /** O relatório em texto (`formatReferences`). */
  texto: string;
}

const live = (rows: Row[]) => rows.filter((r) => r.deleted_at === null || r.deleted_at === undefined);
const text = (v: unknown) => (typeof v === "string" ? v : null);
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

interface PatternIndex {
  byCode: Map<string, { id: string; data: PatternData; trips: TripData[] }>;
  psById: Map<string, { patternId: string; code: string; position: number; stopKey: string; order: number }>;
  patternOfTimetable: Map<string, string>; // timetable id -> pattern id
  patternOfTrip: Map<string, string>; // trip id -> pattern id
  codeOfPattern: Map<string, string>;
}

/** Uma rodada sobre o arquivo: o ponto físico entra pela chave (`stopId` do `PatternData` = chave), igual nos dois arquivos. */
function indexOf(seed: SeedFile): PatternIndex {
  const stopKey = new Map(seed.stops.map((s) => [s.id, s.key]));
  const idx: PatternIndex = { byCode: new Map(), psById: new Map(), patternOfTimetable: new Map(), patternOfTrip: new Map(), codeOfPattern: new Map() };
  const positionOf = new Map<string, number>();
  for (const p of seed.patterns) {
    const stops = seed.patternStops.filter((s) => s.patternId === p.id).sort((a, b) => a.position - b.position);
    const seen = new Map<string, number>();
    for (const s of stops) {
      const key = stopKey.get(s.stopId) ?? s.stopId;
      const order = seen.get(key) ?? 0;
      seen.set(key, order + 1);
      idx.psById.set(s.id, { patternId: p.id, code: p.code, position: s.position, stopKey: key, order });
      positionOf.set(s.id, s.position);
    }
    const data: PatternData = { id: p.id, stops: stops.map((s) => ({ position: s.position, stopId: stopKey.get(s.stopId) ?? s.stopId, isTimepoint: s.isTimepoint })) };
    idx.byCode.set(p.code, { id: p.id, data, trips: [] });
    idx.codeOfPattern.set(p.id, p.code);
  }
  for (const t of seed.timetables) idx.patternOfTimetable.set(t.id, t.patternId);
  for (const t of seed.trips) {
    const patternId = idx.patternOfTimetable.get(t.timetableId);
    if (!patternId) continue;
    idx.patternOfTrip.set(t.id, patternId);
    const stopTimes = seed.stopTimes
      .filter((st) => st.tripId === t.id && positionOf.has(st.patternStopId))
      .map((st) => ({ position: positionOf.get(st.patternStopId)!, serviceMinute: st.serviceMinute, origin: "official" as const }));
    const entry = idx.byCode.get(idx.codeOfPattern.get(patternId)!);
    entry?.trips.push({ id: t.id, patternId, firstPosition: t.firstPosition, lastPosition: t.lastPosition, stopTimes });
  }
  return idx;
}

export function checkReferences(backup: BackupTables | { tables: BackupTables }, previous: SeedFile, next: SeedFile): Referencias {
  const tables: BackupTables = "tables" in backup && backup.tables && typeof backup.tables === "object" && !Array.isArray(backup.tables) ? backup.tables : (backup as BackupTables);
  const rows = (name: string): Row[] => {
    const t = tables[name];
    return Array.isArray(t) ? live(t) : [];
  };
  const prev = indexOf(previous);
  const nova = indexOf(next);

  // ── Opções de ônibus ──
  const opcoes: OpcaoRef[] = [];
  for (const o of rows("option")) {
    if (o.kind !== "bus") continue;
    const id = String(o.id);
    const b = prev.psById.get(String(o.board_pattern_stop_id));
    const a = prev.psById.get(String(o.alight_pattern_stop_id));
    const base: OpcaoRef = { id, classe: "fora_do_arquivo", motivo: null, codigo: null, chaveEmbarque: null, ordemEmbarque: null, ordemDescida: null, embarque: null, embarqueNovo: null, descida: null, descidaNova: null };
    if (!b || !a) {
      opcoes.push(base);
      continue;
    }
    Object.assign(base, { codigo: b.code, chaveEmbarque: b.stopKey, ordemEmbarque: b.order + 1, ordemDescida: a.order + 1, embarque: b.position, descida: a.position });
    const alvo = nova.byCode.get(b.code);
    if (!alvo) opcoes.push({ ...base, classe: "nao_resolve", motivo: "percurso_ausente" });
    else if (alvo.id === b.patternId) opcoes.push({ ...base, classe: "mantida", embarqueNovo: b.position, descidaNova: a.position });
    else {
      const antigo = prev.byCode.get(b.code)!.data;
      const eb = samePassage(antigo, b.position, alvo.data);
      const de = samePassage(antigo, a.position, alvo.data);
      if (eb !== null && de !== null) opcoes.push({ ...base, classe: "resolve", embarqueNovo: eb, descidaNova: de });
      else {
        const faltante = eb === null ? b : a;
        const noNovo = alvo.data.stops.some((s) => s.stopId === faltante.stopKey);
        opcoes.push({ ...base, classe: "nao_resolve", motivo: noNovo ? "passagem_ausente" : "ponto_fora", embarqueNovo: eb, descidaNova: de });
      }
    }
  }
  opcoes.sort(byId);
  const opcaoPorId = new Map(opcoes.map((o) => [o.id, o]));

  // ── Avisos ──
  const avisos: AvisoRef[] = [];
  for (const al of rows("departure_alarm")) {
    const op = opcaoPorId.get(String(al.option_id));
    const aviso: Omit<AvisoRef, "ancora"> = {
      id: String(al.id),
      opcaoId: String(al.option_id),
      classeOpcao: op?.classe ?? "ausente",
      enabled: al.enabled,
      weekdays: al.weekdays,
      onceDate: al.once_date,
      validFrom: al.valid_from,
      validTo: al.valid_to,
    };
    if (!op || op.classe === "nao_resolve" || op.classe === "fora_do_arquivo" || op.embarqueNovo === null) {
      avisos.push({ ...aviso, ancora: { tipo: "opcao_nao_resolve" } });
      continue;
    }
    const minutos: number[] = [];
    for (const t of nova.byCode.get(op.codigo!)!.trips) {
      try {
        const m = baseTimeAt(t, op.embarqueNovo)?.minute;
        if (m !== undefined) minutos.push(m);
      } catch {
        // viagem sem horário de um lado da posição: não tem base ali
      }
    }
    const ancora = Number(al.anchor_base_minute);
    if (minutos.some((m) => m === ancora)) avisos.push({ ...aviso, ancora: { tipo: "ok" } });
    else {
      const abaixo = minutos.filter((m) => m < ancora);
      const acima = minutos.filter((m) => m > ancora);
      avisos.push({ ...aviso, ancora: { tipo: "sem_viagem", abaixo: abaixo.length ? Math.max(...abaixo) : null, acima: acima.length ? Math.min(...acima) : null } });
    }
  }
  avisos.sort(byId);

  // ── Viagens e horários do usuário (presos a percurso cujo id muda) ──
  const idsNovos = new Set(next.patterns.map((p) => p.id));
  const mudou = (patternId: string | undefined) => patternId !== undefined && !idsNovos.has(patternId);
  const conta = (patternIds: (string | undefined)[]) => {
    const m = new Map<string, number>();
    for (const pid of patternIds) if (mudou(pid)) m.set(prev.codeOfPattern.get(pid!)!, (m.get(prev.codeOfPattern.get(pid!)!) ?? 0) + 1);
    return [...m].map(([codigo, n]) => ({ codigo, n })).sort((x, y) => (x.codigo < y.codigo ? -1 : 1));
  };
  const viagensUsuario = conta(rows("trip").filter((t) => t.source === "user").map((t) => prev.patternOfTimetable.get(String(t.timetable_id))));
  const declarados = conta(rows("stop_time").filter((s) => s.origin === "declared").map((s) => prev.patternOfTrip.get(String(s.trip_id))));

  // ── Registros ──
  const porCodigo = new Map<string, ContagemPercurso>();
  for (const ob of rows("observation")) {
    const ps = prev.psById.get(text(ob.pattern_stop_id) ?? "");
    if (!text(ob.pattern_stop_id) || ob.deviation_min === null || ob.deviation_min === undefined) continue;
    const codigo = ps?.code ?? "(fora do arquivo)";
    const c = porCodigo.get(codigo) ?? { codigo, total: 0, traduz: 0, naoTraduz: 0 };
    c.total++;
    const alvo = ps ? nova.byCode.get(ps.code) : undefined;
    const ok = !!ps && !!alvo && (alvo.id === ps.patternId || samePassage(prev.byCode.get(ps.code)!.data, ps.position, alvo.data) !== null);
    if (ok) c.traduz++;
    else c.naoTraduz++;
    porCodigo.set(codigo, c);
  }
  const registros = [...porCodigo.values()].sort((x, y) => (x.codigo < y.codigo ? -1 : 1));

  const podeImportar = !opcoes.some((o) => o.classe === "nao_resolve") && !avisos.some((a) => a.ancora.tipo !== "ok");
  const parcial = { opcoes, avisos, viagensUsuario, declarados, registros, podeImportar };
  return { ...parcial, texto: formatReferences(parcial) };
}

const n = (v: number | null) => (v === null ? "-" : String(v));
const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? null));

/** Texto em ordem fixa, sem data nem relógio. */
export function formatReferences(r: Omit<Referencias, "texto">): string {
  const L: string[] = ["Opcoes"];
  for (const o of r.opcoes) {
    L.push(
      o.codigo === null
        ? `  opcao ${o.id}: fora_do_arquivo`
        : `  opcao ${o.id}: percurso ${o.codigo} ponto ${o.chaveEmbarque} ordem ${o.ordemEmbarque}/${o.ordemDescida} embarque ${o.embarque}->${n(o.embarqueNovo)} descida ${o.descida}->${n(o.descidaNova)} ${o.classe}${o.motivo ? ` ${o.motivo}` : ""}`,
    );
  }
  L.push("", "Avisos");
  for (const a of r.avisos) {
    const anc = a.ancora.tipo === "sem_viagem" ? `sem_viagem abaixo ${n(a.ancora.abaixo)} acima ${n(a.ancora.acima)}` : a.ancora.tipo;
    L.push(`  aviso ${a.id}: opcao ${a.opcaoId} ${a.classeOpcao} enabled ${show(a.enabled)} weekdays ${show(a.weekdays)} once_date ${show(a.onceDate)} valid ${show(a.validFrom)}..${show(a.validTo)} ancora ${anc}`);
  }
  L.push("", "Viagens e horarios do usuario");
  for (const v of r.viagensUsuario) L.push(`  viagens do usuario: percurso ${v.codigo} ${v.n}`);
  for (const v of r.declarados) L.push(`  horarios declarados: percurso ${v.codigo} ${v.n}`);
  L.push("", "Registros");
  for (const c of r.registros) L.push(`  percurso ${c.codigo}: ${c.total} registros, ${c.traduz} traduzem, ${c.naoTraduz} nao`);
  const cnt = (cl: ClasseOpcao) => r.opcoes.filter((o) => o.classe === cl).length;
  const sem = r.avisos.filter((a) => a.ancora.tipo !== "ok").length;
  L.push(
    "",
    "Resumo",
    `  opcoes: ${r.opcoes.length} (resolve ${cnt("resolve")}, mantida ${cnt("mantida")}, nao_resolve ${cnt("nao_resolve")}, fora_do_arquivo ${cnt("fora_do_arquivo")})`,
    `  avisos: ${r.avisos.length} (sem viagem ${sem})`,
    `  viagens do usuario: ${r.viagensUsuario.reduce((s, v) => s + v.n, 0)}; horarios declarados: ${r.declarados.reduce((s, v) => s + v.n, 0)}`,
    `  registros: ${r.registros.reduce((s, c) => s + c.total, 0)} (nao traduzem ${r.registros.reduce((s, c) => s + c.naoTraduz, 0)})`,
    r.podeImportar ? "PODE_IMPORTAR" : "REVER",
    "",
  );
  return L.join("\n");
}
