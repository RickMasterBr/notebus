// Compara dois feeds GTFS ja lidos (lib/gtfs.mjs) e devolve dados puros.
// Nao escreve em lugar nenhum; formatarRelatorio so transforma o resultado em texto.
import { DIAS } from './gtfs.mjs';

// aproximacao plana (contrato): graus * 111320 m; longitude * cosseno da latitude
export const METROS_POR_GRAU = 111320;
export const LIMITE_METROS = 20;

const texto = (v) => (v === undefined || v === null ? '' : String(v));
const compara = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const ascii = (s) => String(s).replace(/[^\x00-\x7F]/g, '?');
const vazio = (v) => (texto(v) === '' ? '(ausente)' : texto(v));

// elementos de a que nao estao em b, em ordem
const diferenca = (a, b) => [...a].filter((x) => !b.has(x)).sort(compara);

const identificadorRota = (rota) => texto(rota.nomeCurto) || texto(rota.id);
const chavePonto = (ponto) => texto(ponto.codigo) || texto(ponto.id);

// --- FEED: versao e vigencia -------------------------------------------------

const RESUMO_INFO = [
  ['feed_version', 'versao'],
  ['feed_start_date', 'inicio'],
  ['feed_end_date', 'fim'],
];

const ladoInfo = (feed) => {
  const i = feed.info ?? null;
  return {
    presente: Boolean(i),
    versao: texto(i?.versao),
    inicio: texto(i?.inicio),
    fim: texto(i?.fim),
  };
};

const compararInfo = (vigente, novo) => {
  const v = ladoInfo(vigente);
  const n = ladoInfo(novo);
  const campos = [];
  for (const [campo, chave] of RESUMO_INFO) {
    if (v[chave] !== n[chave]) campos.push({ campo, vigente: v[chave], novo: n[chave] });
  }
  return { vigente: v, novo: n, campos, mudou: campos.length > 0 };
};

// --- ROTAS: acrescentadas e retiradas por route_short_name -------------------

const compararRotas = (vigente, novo) => {
  const v = new Set(vigente.rotas.map(identificadorRota));
  const n = new Set(novo.rotas.map(identificadorRota));
  return { acrescentadas: diferenca(n, v), retiradas: diferenca(v, n) };
};

// --- PARTIDAS: primeiro ponto de cada viagem, por rota/direcao/servico ------

const hhmm = (hora) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(texto(hora));
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
};

const gruposDePartidas = (feed) => {
  const nomeDaRota = new Map(feed.rotas.map((r) => [texto(r.id), identificadorRota(r)]));
  const porViagem = new Map(feed.viagens.map((v) => [texto(v.id), v]));
  // primeiro ponto = stop_times de menor stop_sequence de cada viagem
  const primeira = new Map();
  for (const h of feed.horarios) {
    const atual = primeira.get(h.viagem);
    if (!atual || h.sequencia < atual.sequencia) primeira.set(h.viagem, h);
  }
  const grupos = new Map();
  for (const [idViagem, horario] of primeira) {
    const viagem = porViagem.get(idViagem);
    if (!viagem) continue;
    const hora = hhmm(horario.hora);
    if (hora === null) continue;
    const rota = nomeDaRota.get(texto(viagem.rota)) ?? texto(viagem.rota);
    const chave = `${rota}\u0000${texto(viagem.direcao)}\u0000${texto(viagem.servico)}`;
    if (!grupos.has(chave)) grupos.set(chave, { rota, direction_id: texto(viagem.direcao), service_id: texto(viagem.servico), horarios: new Set() });
    grupos.get(chave).horarios.add(hora);
  }
  return grupos;
};

const compararPartidas = (vigente, novo) => {
  const v = gruposDePartidas(vigente);
  const n = gruposDePartidas(novo);
  const linhas = [];
  for (const chave of new Set([...v.keys(), ...n.keys()])) {
    const a = v.get(chave);
    const b = n.get(chave);
    const soNovo = diferenca(b?.horarios ?? new Set(), a?.horarios ?? new Set());
    const soVigente = diferenca(a?.horarios ?? new Set(), b?.horarios ?? new Set());
    if (soNovo.length === 0 && soVigente.length === 0) continue;
    const base = b ?? a;
    linhas.push({
      rota: base.rota,
      direction_id: base.direction_id,
      service_id: base.service_id,
      so_no_novo: soNovo,
      so_no_vigente: soVigente,
    });
  }
  linhas.sort((a, b) => compara(a.rota, b.rota) || compara(a.direction_id, b.direction_id) || compara(a.service_id, b.service_id));
  return linhas;
};

// --- SERVICOS: acrescentados, retirados e alterados -------------------------

const compararServicos = (vigente, novo) => {
  const v = new Map(vigente.calendario.map((c) => [texto(c.servico), c]));
  const n = new Map(novo.calendario.map((c) => [texto(c.servico), c]));
  const alterados = [];
  for (const servico of [...v.keys()].filter((k) => n.has(k)).sort(compara)) {
    const a = v.get(servico);
    const b = n.get(servico);
    const campos = [];
    DIAS.forEach((dia, i) => {
      const va = texto(a.dias?.[i]);
      const vb = texto(b.dias?.[i]);
      if (va !== vb) campos.push({ campo: dia, vigente: va, novo: vb });
    });
    if (texto(a.inicio) !== texto(b.inicio)) campos.push({ campo: 'start_date', vigente: texto(a.inicio), novo: texto(b.inicio) });
    if (texto(a.fim) !== texto(b.fim)) campos.push({ campo: 'end_date', vigente: texto(a.fim), novo: texto(b.fim) });
    if (campos.length > 0) alterados.push({ service_id: servico, campos });
  }
  return { acrescentados: diferenca(new Set(n.keys()), v), retirados: diferenca(new Set(v.keys()), n), alterados };
};

// --- EXCECOES: contagem por service_id e tipo --------------------------------

const contarExcecoes = (feed) => {
  const mapa = new Map();
  for (const e of feed.excecoes) {
    const chave = `${texto(e.servico)}\u0000${texto(e.tipo)}`;
    if (!mapa.has(chave)) mapa.set(chave, { service_id: texto(e.servico), tipo: texto(e.tipo), total: 0 });
    mapa.get(chave).total++;
  }
  return mapa;
};

const compararExcecoes = (vigente, novo) => {
  const v = contarExcecoes(vigente);
  const n = contarExcecoes(novo);
  const linhas = [];
  for (const chave of new Set([...v.keys(), ...n.keys()])) {
    const totalVigente = v.get(chave)?.total ?? 0;
    const totalNovo = n.get(chave)?.total ?? 0;
    if (totalVigente === totalNovo) continue;
    const base = n.get(chave) ?? v.get(chave);
    linhas.push({ service_id: base.service_id, tipo: base.tipo, vigente: totalVigente, novo: totalNovo });
  }
  linhas.sort((a, b) => compara(a.service_id, b.service_id) || compara(a.tipo, b.tipo));
  return linhas;
};

// --- PONTOS: acrescentados, retirados e movidos mais de 20 m ----------------

export const distanciaMetros = (a, b) => {
  const latMedia = (a.lat + b.lat) / 2;
  const dlat = (b.lat - a.lat) * METROS_POR_GRAU;
  const dlon = (b.lon - a.lon) * METROS_POR_GRAU * Math.cos((latMedia * Math.PI) / 180);
  return Math.sqrt(dlat * dlat + dlon * dlon);
};

const compararPontos = (vigente, novo) => {
  const v = new Map(vigente.paradas.map((p) => [chavePonto(p), p]));
  const n = new Map(novo.paradas.map((p) => [chavePonto(p), p]));
  const movidos = [];
  for (const codigo of [...v.keys()].filter((k) => n.has(k)).sort(compara)) {
    const a = v.get(codigo);
    const b = n.get(codigo);
    if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) continue;
    const metros = distanciaMetros(a, b);
    if (metros > LIMITE_METROS) movidos.push({ codigo, distancia_m: Math.round(metros) });
  }
  return { acrescentados: diferenca(new Set(n.keys()), v), retirados: diferenca(new Set(v.keys()), n), movidos };
};

// --- resultado ---------------------------------------------------------------

// C2: compara dois feeds ja lidos e devolve os assuntos, sem escrever nada
export const compararFeeds = (vigente, novo) => {
  const feed = compararInfo(vigente, novo);
  const rotas = compararRotas(vigente, novo);
  const partidas = compararPartidas(vigente, novo);
  const servicos = compararServicos(vigente, novo);
  const excecoes = compararExcecoes(vigente, novo);
  const pontos = compararPontos(vigente, novo);

  // total de mudancas: um por campo do feed, rota, partida listada, servico,
  // contagem de excecao e ponto (cada partida so_no_novo/so_no_vigente conta)
  const total =
    feed.campos.length +
    rotas.acrescentadas.length +
    rotas.retiradas.length +
    partidas.reduce((soma, p) => soma + p.so_no_novo.length + p.so_no_vigente.length, 0) +
    servicos.acrescentados.length +
    servicos.retirados.length +
    servicos.alterados.length +
    excecoes.length +
    pontos.acrescentados.length +
    pontos.retirados.length +
    pontos.movidos.length;

  return { feed, rotas, partidas, servicos, excecoes, pontos, total };
};

// --- texto ------------------------------------------------------------------

const SEM_MUDANCA = '  (sem mudancas)';

export const formatarRelatorio = (r) => {
  const linhas = [];

  linhas.push('FEED');
  linhas.push(`  vigente: versao=${vazio(r.feed.vigente.versao)} inicio=${vazio(r.feed.vigente.inicio)} fim=${vazio(r.feed.vigente.fim)}`);
  linhas.push(`  novo: versao=${vazio(r.feed.novo.versao)} inicio=${vazio(r.feed.novo.inicio)} fim=${vazio(r.feed.novo.fim)}`);
  linhas.push(`  mudou: ${r.feed.mudou ? 'sim' : 'nao'}`);
  if (r.feed.campos.length === 0) linhas.push(SEM_MUDANCA);
  for (const c of r.feed.campos) linhas.push(`  ${c.campo}: ${vazio(c.vigente)} -> ${vazio(c.novo)}`);

  linhas.push('ROTAS');
  if (r.rotas.acrescentadas.length === 0 && r.rotas.retiradas.length === 0) linhas.push(SEM_MUDANCA);
  for (const rota of r.rotas.acrescentadas) linhas.push(`  + ${vazio(rota)}`);
  for (const rota of r.rotas.retiradas) linhas.push(`  - ${vazio(rota)}`);

  linhas.push('PARTIDAS');
  if (r.partidas.length === 0) linhas.push(SEM_MUDANCA);
  for (const p of r.partidas) {
    const novo = p.so_no_novo.length > 0 ? p.so_no_novo.join(',') : '-';
    const vigente = p.so_no_vigente.length > 0 ? p.so_no_vigente.join(',') : '-';
    linhas.push(`  rota=${vazio(p.rota)} direction_id=${vazio(p.direction_id)} service_id=${vazio(p.service_id)} so_no_novo=${novo} so_no_vigente=${vigente}`);
  }

  linhas.push('SERVICOS');
  if (r.servicos.acrescentados.length === 0 && r.servicos.retirados.length === 0 && r.servicos.alterados.length === 0) linhas.push(SEM_MUDANCA);
  for (const servico of r.servicos.acrescentados) linhas.push(`  + ${vazio(servico)}`);
  for (const servico of r.servicos.retirados) linhas.push(`  - ${vazio(servico)}`);
  for (const s of r.servicos.alterados) {
    const campos = s.campos.map((c) => `${c.campo} ${vazio(c.vigente)} -> ${vazio(c.novo)}`).join('; ');
    linhas.push(`  ~ ${vazio(s.service_id)}: ${campos}`);
  }

  linhas.push('EXCECOES');
  if (r.excecoes.length === 0) linhas.push(SEM_MUDANCA);
  for (const e of r.excecoes) linhas.push(`  service_id=${vazio(e.service_id)} tipo=${vazio(e.tipo)} vigente=${e.vigente} novo=${e.novo}`);

  linhas.push('PONTOS');
  if (r.pontos.acrescentados.length === 0 && r.pontos.retirados.length === 0 && r.pontos.movidos.length === 0) linhas.push(SEM_MUDANCA);
  for (const ponto of r.pontos.acrescentados) linhas.push(`  + ${vazio(ponto)}`);
  for (const ponto of r.pontos.retirados) linhas.push(`  - ${vazio(ponto)}`);
  for (const m of r.pontos.movidos) linhas.push(`  ~ ${vazio(m.codigo)} movido ${m.distancia_m} m`);

  linhas.push(`RESUMO ${r.total}`);
  return `${ascii(linhas.join('\n'))}\n`;
};
