/**
 * Proposta da tabela de equivalência de pontos (D-086, ADR-0007 §3): alinha o itinerário do feed com o do arquivo anterior.
 * Só propõe; quem aceita as linhas incertas é a pessoa. Pura.
 */
import { analyzeRoute } from "./patterns.ts";
import type { GtfsFeed, NetworkConfig, SeedFile } from "./types.ts";

export type StopSource = "codigo" | "nome" | "intervalo" | "novo" | "novo_sem_codigo";

export interface StopEntry {
  stopId: string;
  key: string;
  name: string;
  aliases: string[];
  externalId: string | null;
  source: StopSource;
  /** Códigos dos percursos da configuração em que a paragem aparece. */
  patterns: string[];
}

export interface PendingStop {
  pattern: string;
  position: number;
  key: string;
  name: string;
  candidates: { stopId: string; code: string; name: string }[];
}

export interface StopConflict {
  kind: "stopId" | "key";
  /** O `stopId` do feed (kind stopId) ou a chave do app (kind key). */
  id: string;
  /** Todas as chaves (kind stopId) ou todos os `stopId` (kind key) em disputa, em ordem. */
  values: string[];
  /** O que ficou com a entrada. */
  kept: string;
}

export interface StopProposal {
  entries: StopEntry[];
  pending: PendingStop[];
  conflicts: StopConflict[];
}

type AppStop = SeedFile["stops"][number];
type Paired = "codigo" | "nome" | "intervalo";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const RANK: Record<Paired, number> = { codigo: 0, nome: 1, intervalo: 2 };

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface Pair {
  feedId: string;
  app: AppStop;
  source: Paired;
  pattern: string;
}

export function proposeStopTable(feed: GtfsFeed, config: Pick<NetworkConfig, "patterns">, previous: SeedFile): StopProposal {
  const feedStop = new Map(feed.paradas.map((p) => [p.id, p]));
  const codeCount = new Map<string, number>();
  for (const p of feed.paradas) codeCount.set(p.codigo, (codeCount.get(p.codigo) ?? 0) + 1);
  const appStopById = new Map(previous.stops.map((s) => [s.id, s]));
  const codeOf = (id: string) => feedStop.get(id)?.codigo ?? "";

  const pairs: Pair[] = [];
  const pending: PendingStop[] = [];
  const used = new Map<string, Set<string>>(); // stopId do feed → códigos dos percursos que o usam

  for (const p of config.patterns) {
    const itinerary = analyzeRoute(feed, p.routeId).itinerary;
    const tripStops = new Set<string>(itinerary);
    const tripIds = new Set(feed.viagens.filter((v) => v.rota === p.routeId).map((v) => v.id));
    for (const h of feed.horarios) if (tripIds.has(h.viagem)) tripStops.add(h.parada);
    for (const id of tripStops) used.set(id, (used.get(id) ?? new Set()).add(p.code));

    const prev = previous.patterns.find((x) => x.code === p.code);
    const app = prev
      ? previous.patternStops
          .filter((s) => s.patternId === prev.id)
          .sort((a, b) => a.position - b.position)
          .flatMap((s) => (appStopById.has(s.stopId) ? [{ position: s.position, stop: appStopById.get(s.stopId)! }] : []))
      : [];
    const n = app.length;
    const m = itinerary.length;

    const sourceOf = (i: number, j: number): Paired | null => {
      const a = app[i]!.stop;
      const f = feedStop.get(itinerary[j]!);
      if (!f) return null;
      if (a.externalId !== null && f.codigo !== "" && a.externalId === f.codigo) return "codigo";
      const na = normalizeName(a.name);
      return na !== "" && na === normalizeName(f.nome) ? "nome" : null;
    };

    // dp[i][j]: tamanho da maior subsequência comum do que sobra (app de i, feed de j)
    const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!, sourceOf(i, j) ? dp[i + 1]![j + 1]! + 1 : 0);
      }
    }
    const anchors: { i: number; j: number; source: Paired }[] = [];
    for (let i = 0, j = 0; i < n && j < m; ) {
      const source = sourceOf(i, j);
      if (source && dp[i]![j] === dp[i + 1]![j + 1]! + 1) {
        anchors.push({ i, j, source });
        i++;
        j++;
      } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
      else j++;
    }
    for (const a of anchors) pairs.push({ feedId: itinerary[a.j]!, app: app[a.i]!.stop, source: a.source, pattern: p.code });

    // lacunas entre âncoras vizinhas e nas pontas
    const bounds = [{ i: -1, j: -1 }, ...anchors, { i: n, j: m }];
    for (let b = 0; b + 1 < bounds.length; b++) {
      const from = bounds[b]!;
      const to = bounds[b + 1]!;
      const appGap = app.slice(from.i + 1, to.i);
      const feedGap = itinerary.slice(from.j + 1, to.j);
      if (appGap.length === 0) continue;
      if (appGap.length === feedGap.length) {
        appGap.forEach((a, k) => pairs.push({ feedId: feedGap[k]!, app: a.stop, source: "intervalo", pattern: p.code }));
      } else {
        const candidates = feedGap.map((id) => ({ stopId: id, code: codeOf(id), name: feedStop.get(id)?.nome ?? "" }));
        for (const a of appGap) pending.push({ pattern: p.code, position: a.position, key: a.stop.key, name: a.stop.name, candidates });
      }
    }
  }

  // C4: a mesma paragem do feed com chaves diferentes → fica uma; depois a mesma chave pedida por duas paragens → fica uma
  const conflicts: StopConflict[] = [];
  const keyRank = (feedId: string, app: AppStop) => (app.externalId !== null && app.externalId === codeOf(feedId) && codeOf(feedId) !== "" ? 0 : 1);
  const byFeed = new Map<string, Pair[]>();
  for (const pr of pairs) byFeed.set(pr.feedId, [...(byFeed.get(pr.feedId) ?? []), pr]);
  const chosen = new Map<string, Pair[]>(); // stopId do feed → pares da chave escolhida
  for (const [feedId, list] of byFeed) {
    const keys = [...new Set(list.map((x) => x.app.key))].sort(cmp);
    const best = [...keys].sort((a, b) => {
      const pa = list.find((x) => x.app.key === a)!.app;
      const pb = list.find((x) => x.app.key === b)!.app;
      return keyRank(feedId, pa) - keyRank(feedId, pb) || cmp(a, b);
    })[0]!;
    if (keys.length > 1) conflicts.push({ kind: "stopId", id: feedId, values: keys, kept: best });
    chosen.set(feedId, list.filter((x) => x.app.key === best));
  }
  const byKey = new Map<string, string[]>();
  for (const [feedId, list] of chosen) byKey.set(list[0]!.app.key, [...(byKey.get(list[0]!.app.key) ?? []), feedId]);
  const demoted = new Set<string>();
  for (const [key, ids] of byKey) {
    if (ids.length < 2) continue;
    const sorted = [...ids].sort((a, b) => {
      const ra = keyRank(a, chosen.get(a)![0]!.app);
      const rb = keyRank(b, chosen.get(b)![0]!.app);
      return ra - rb || cmp(a, b);
    });
    conflicts.push({ kind: "key", id: key, values: [...ids].sort(cmp), kept: sorted[0]! });
    for (const id of sorted.slice(1)) {
      chosen.delete(id);
      demoted.add(id);
    }
  }

  const entries: StopEntry[] = [];
  for (const [feedId, list] of chosen) {
    const app = list[0]!.app;
    const source = list.map((x) => x.source).sort((a, b) => RANK[a] - RANK[b])[0]!;
    entries.push({ stopId: feedId, key: app.key, name: app.name, aliases: [...app.aliases], externalId: app.externalId, source, patterns: [...new Set(list.map((x) => x.pattern))].sort(cmp) });
  }
  // C3: paragem usada pelos percursos que ficou sem par (ou perdeu a chave numa disputa)
  for (const [feedId, patterns] of used) {
    if (chosen.has(feedId) && !demoted.has(feedId)) continue;
    const f = feedStop.get(feedId);
    if (!f) continue;
    const unique = f.codigo !== "" && codeCount.get(f.codigo) === 1;
    entries.push({
      stopId: feedId,
      key: `mobilis/stop/${unique ? f.codigo : feedId}`,
      name: f.nome,
      aliases: [],
      externalId: null,
      source: unique ? "novo" : "novo_sem_codigo",
      patterns: [...patterns].sort(cmp),
    });
  }

  entries.sort((a, b) => cmp(a.stopId, b.stopId));
  pending.sort((a, b) => cmp(a.pattern, b.pattern) || a.position - b.position);
  conflicts.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.id, b.id));
  return { entries, pending, conflicts };
}
