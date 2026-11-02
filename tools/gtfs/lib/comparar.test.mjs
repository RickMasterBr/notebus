// Testes de lib/comparar.mjs (C2): um assunto por teste, com dois feeds
// inventados que diferem so naquele assunto. Sem relogio real, sem dado real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compararFeeds, formatarRelatorio, distanciaMetros, LIMITE_METROS } from './comparar.mjs';

// feed em memoria, no formato que lib/gtfs.mjs devolve
const feed = (o = {}) => ({
  pasta: 'inventado',
  info: o.info === undefined ? { versao: 'v1', inicio: '20260101', fim: '20261231' } : o.info,
  rotas: o.rotas ?? [{ id: 'R1', nomeCurto: '1' }],
  viagens: o.viagens ?? [{ id: 'T1', rota: 'R1', servico: 'U1', direcao: '0' }],
  horarios: o.horarios ?? [{ viagem: 'T1', parada: 'P1', sequencia: 1, hora: '08:00:00' }],
  paradas: o.paradas ?? [{ id: 'P1', codigo: '100', lat: 39.7436, lon: -8.8071 }],
  calendario: o.calendario ?? [{ servico: 'U1', dias: ['1', '1', '1', '1', '1', '0', '0'], inicio: '20260101', fim: '20261231' }],
  excecoes: o.excecoes ?? [],
});

const SEM_NENHUMA_MUDANCA = {
  rotas: { acrescentadas: [], retiradas: [] },
  partidas: [],
  servicos: { acrescentados: [], retirados: [], alterados: [] },
  excecoes: [],
  pontos: { acrescentados: [], retirados: [], movidos: [] },
};

test('C2 feed: feed_version, inicio e fim de cada feed e o que mudou', () => {
  const r = compararFeeds(feed(), feed({ info: { versao: 'v2', inicio: '20260101', fim: '20261231' } }));
  assert.deepEqual(r.feed.vigente, { presente: true, versao: 'v1', inicio: '20260101', fim: '20261231' });
  assert.deepEqual(r.feed.novo, { presente: true, versao: 'v2', inicio: '20260101', fim: '20261231' });
  assert.deepEqual(r.feed.campos, [{ campo: 'feed_version', vigente: 'v1', novo: 'v2' }]);
  assert.equal(r.feed.mudou, true);
  assert.equal(r.total, 1);
  assert.deepEqual(r.rotas, SEM_NENHUMA_MUDANCA.rotas);
  assert.deepEqual(r.partidas, SEM_NENHUMA_MUDANCA.partidas);
  assert.deepEqual(r.servicos, SEM_NENHUMA_MUDANCA.servicos);
  assert.deepEqual(r.excecoes, SEM_NENHUMA_MUDANCA.excecoes);
  assert.deepEqual(r.pontos, SEM_NENHUMA_MUDANCA.pontos);
});

test('C2 feed: fim da vigencia conta como mudanca (e o inicio tambem)', () => {
  const soFim = compararFeeds(feed(), feed({ info: { versao: 'v1', inicio: '20260101', fim: '20270131' } }));
  assert.deepEqual(soFim.feed.campos, [{ campo: 'feed_end_date', vigente: '20261231', novo: '20270131' }]);
  assert.equal(soFim.total, 1);

  const soInicio = compararFeeds(feed(), feed({ info: { versao: 'v1', inicio: '20260201', fim: '20261231' } }));
  assert.deepEqual(soInicio.feed.campos, [{ campo: 'feed_start_date', vigente: '20260101', novo: '20260201' }]);
});

test('C2 feed: feed_info ausente entra como vazio', () => {
  const r = compararFeeds(feed({ info: null }), feed());
  assert.deepEqual(r.feed.vigente, { presente: false, versao: '', inicio: '', fim: '' });
  assert.deepEqual(r.feed.campos, [
    { campo: 'feed_version', vigente: '', novo: 'v1' },
    { campo: 'feed_start_date', vigente: '', novo: '20260101' },
    { campo: 'feed_end_date', vigente: '', novo: '20261231' },
  ]);
});

test('C2 rotas: acrescentadas e retiradas por route_short_name', () => {
  const v = feed({
    rotas: [
      { id: 'R1', nomeCurto: '1' },
      { id: 'R2', nomeCurto: '2' },
    ],
    viagens: [],
    horarios: [],
  });
  const n = feed({
    rotas: [
      { id: 'R1', nomeCurto: '1' },
      { id: 'R3', nomeCurto: '3' },
    ],
    viagens: [],
    horarios: [],
  });
  const r = compararFeeds(v, n);
  assert.deepEqual(r.rotas, { acrescentadas: ['3'], retiradas: ['2'] });
  assert.equal(r.total, 2);
  assert.deepEqual(r.partidas, []);
});

test('C2 partidas: so no novo e so no vigente, por rota, direction_id e service_id', () => {
  const v = feed({
    horarios: [
      { viagem: 'T1', parada: 'P1', sequencia: 1, hora: '08:00:00' },
      { viagem: 'T2', parada: 'P1', sequencia: 1, hora: '09:00:00' },
    ],
    viagens: [
      { id: 'T1', rota: 'R1', servico: 'U1', direcao: '0' },
      { id: 'T2', rota: 'R1', servico: 'U1', direcao: '0' },
    ],
  });
  const n = feed({
    horarios: [
      { viagem: 'T1', parada: 'P1', sequencia: 1, hora: '08:10:00' },
      { viagem: 'T2', parada: 'P1', sequencia: 1, hora: '09:00:00' },
    ],
    viagens: [
      { id: 'T1', rota: 'R1', servico: 'U1', direcao: '0' },
      { id: 'T2', rota: 'R1', servico: 'U1', direcao: '0' },
    ],
  });
  const r = compararFeeds(v, n);
  assert.deepEqual(r.partidas, [
    { rota: '1', direction_id: '0', service_id: 'U1', so_no_novo: ['08:10'], so_no_vigente: ['08:00'] },
  ]);
  assert.equal(r.total, 2);
  assert.deepEqual(r.rotas, SEM_NENHUMA_MUDANCA.rotas);
});

test('C2 partidas: usa o stop_times de menor stop_sequence de cada viagem', () => {
  const v = feed({
    horarios: [
      { viagem: 'T1', parada: 'P2', sequencia: 2, hora: '09:00:00' },
      { viagem: 'T1', parada: 'P1', sequencia: 1, hora: '08:00:00' },
    ],
  });
  const n = feed({
    horarios: [
      { viagem: 'T1', parada: 'P1', sequencia: 1, hora: '08:00:00' },
      { viagem: 'T1', parada: 'P2', sequencia: 2, hora: '09:30:00' },
    ],
  });
  const r = compararFeeds(v, n);
  assert.deepEqual(r.partidas, []);
  assert.equal(r.total, 0);
});

test('C2 servicos: acrescentados, retirados e os que mudaram dias ou datas', () => {
  const v = feed({
    calendario: [
      { servico: 'U1', dias: ['1', '1', '1', '1', '1', '0', '0'], inicio: '20260101', fim: '20261231' },
      { servico: 'U3', dias: ['0', '0', '0', '0', '0', '1', '0'], inicio: '20260101', fim: '20261231' },
    ],
  });
  const n = feed({
    calendario: [
      { servico: 'U1', dias: ['1', '1', '1', '1', '1', '1', '0'], inicio: '20260101', fim: '20261231' },
      { servico: 'U2', dias: ['0', '0', '0', '0', '0', '0', '1'], inicio: '20260301', fim: '20260630' },
    ],
  });
  const r = compararFeeds(v, n);
  assert.deepEqual(r.servicos, {
    acrescentados: ['U2'],
    retirados: ['U3'],
    alterados: [{ service_id: 'U1', campos: [{ campo: 'saturday', vigente: '0', novo: '1' }] }],
  });
  assert.equal(r.total, 3);
  assert.deepEqual(r.partidas, []);
});

test('C2 servicos: datas de inicio e fim que mudaram sao listadas', () => {
  const v = feed();
  const n = feed({ calendario: [{ servico: 'U1', dias: ['1', '1', '1', '1', '1', '0', '0'], inicio: '20260201', fim: '20270228' }] });
  const r = compararFeeds(v, n);
  assert.deepEqual(r.servicos.alterados, [
    {
      service_id: 'U1',
      campos: [
        { campo: 'start_date', vigente: '20260101', novo: '20260201' },
        { campo: 'end_date', vigente: '20261231', novo: '20270228' },
      ],
    },
  ]);
});

test('C2 excecoes: contagem de calendar_dates por service_id e tipo que mudou', () => {
  const v = feed({ excecoes: [{ servico: 'U1', data: '20260401', tipo: '2' }] });
  const n = feed({
    excecoes: [
      { servico: 'U1', data: '20260401', tipo: '2' },
      { servico: 'U1', data: '20260402', tipo: '2' },
      { servico: 'U2', data: '20260403', tipo: '1' },
    ],
  });
  const r = compararFeeds(v, n);
  assert.deepEqual(r.excecoes, [
    { service_id: 'U1', tipo: '2', vigente: 1, novo: 2 },
    { service_id: 'U2', tipo: '1', vigente: 0, novo: 1 },
  ]);
  assert.equal(r.total, 2);
  assert.deepEqual(r.partidas, []);
});

test('C2 excecoes: mesma contagem nao entra no relatorio', () => {
  const v = feed({ excecoes: [{ servico: 'U1', data: '20260401', tipo: '2' }] });
  const n = feed({ excecoes: [{ servico: 'U1', data: '20260909', tipo: '2' }] });
  assert.deepEqual(compararFeeds(v, n).excecoes, []);
});

test('C2 pontos: acrescentados, retirados e coordenada movida mais de 20 m', () => {
  const v = feed({
    paradas: [
      { id: 'P1', codigo: '100', lat: 39.7436, lon: -8.8071 }, // move 50 m
      { id: 'P3', codigo: '300', lat: 39.74, lon: -8.8 },
      { id: 'P4', codigo: '400', lat: 39.75, lon: -8.81 }, // move 5 m: nao conta
    ],
  });
  const n = feed({
    paradas: [
      { id: 'P1', codigo: '100', lat: 39.7436 + 0.00045, lon: -8.8071 },
      { id: 'P2', codigo: '200', lat: 39.741, lon: -8.8 },
      { id: 'P4', codigo: '400', lat: 39.75 + 0.000045, lon: -8.81 },
    ],
  });
  const r = compararFeeds(v, n);
  assert.deepEqual(r.pontos, { acrescentados: ['200'], retirados: ['300'], movidos: [{ codigo: '100', distancia_m: 50 }] });
  assert.equal(r.total, 3);
  assert.deepEqual(r.partidas, []);
});

test('C2 pontos: o limite e 20 m e a conta plana e a do contrato', () => {
  assert.equal(LIMITE_METROS, 20);
  const a = { lat: 39.7436, lon: -8.8071 };
  const norte = 0.00045;
  assert.ok(distanciaMetros(a, { lat: a.lat + norte, lon: a.lon }) > 20);
  assert.ok(distanciaMetros(a, { lat: a.lat + 0.000045, lon: a.lon }) < 20);
  // 1 grau de latitude = 111320 m
  assert.ok(Math.abs(distanciaMetros({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - 111320) < 1);
});

test('C2 resultado: feeds equivalentes nao tem mudanca e o texto termina em RESUMO 0', () => {
  const r = compararFeeds(feed(), feed({ pasta: 'outro' }));
  assert.equal(r.total, 0);
  const linhas = formatarRelatorio(r).trimEnd().split('\n');
  assert.equal(linhas[linhas.length - 1], 'RESUMO 0');
  for (const secao of ['FEED', 'ROTAS', 'PARTIDAS', 'SERVICOS', 'EXCECOES', 'PONTOS']) {
    assert.ok(linhas.includes(secao), `faltou a secao ${secao}`);
  }
});

test('C2 resultado: uma secao por assunto e uma linha final RESUMO com o total', () => {
  const v = feed();
  const n = feed({
    info: { versao: 'v2', inicio: '20260101', fim: '20261231' },
    rotas: [
      { id: 'R1', nomeCurto: '1' },
      { id: 'R8', nomeCurto: '8' },
    ],
    horarios: [{ viagem: 'T1', parada: 'P1', sequencia: 1, hora: '08:10:00' }],
    paradas: [{ id: 'P1', codigo: '100', lat: 39.7436 + 0.00045, lon: -8.8071 }],
  });
  const r = compararFeeds(v, n);
  // feed_version (1) + rota 8 (1) + partidas 08:10 e 08:00 (2) + ponto 100 movido (1)
  assert.equal(r.total, 5);
  const texto = formatarRelatorio(r);
  assert.ok(texto.endsWith('RESUMO 5\n'));
  assert.ok(texto.includes('FEED\n'));
  assert.ok(texto.includes('ROTAS\n'));
  assert.ok(texto.includes('PARTIDAS\n'));
  assert.ok(texto.includes('  + 8\n'));
  assert.ok(texto.includes('so_no_novo=08:10 so_no_vigente=08:00'));
  assert.ok(texto.includes('  ~ 100 movido 50 m\n'));
  assert.deepEqual(r.servicos, SEM_NENHUMA_MUDANCA.servicos);
});
