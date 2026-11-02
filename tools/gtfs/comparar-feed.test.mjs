// Testes do CLI comparar-feed.mjs (C3): codigos de saida, ASCII, nao escreve.
// Feeds inventados em pasta temporaria; sem relogio real e sem dado real (A6/A13).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'comparar-feed.mjs');

const BASE = {
  'routes.txt': 'route_id,route_short_name\nR1,1\n',
  'trips.txt': 'route_id,service_id,trip_id,direction_id\nR1,U1,T1,0\n',
  'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,P1,1\n',
  'stops.txt': 'stop_id,stop_code,stop_lat,stop_lon\nP1,100,39.7436,-8.8071\n',
  'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nU1,1,1,1,1,1,0,0,20260101,20261231\n',
  'feed_info.txt': 'feed_publisher_name,feed_version,feed_start_date,feed_end_date\nInventado,v1,20260101,20261231\n',
};

const montarFeed = (mudancas = {}) => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'notebus-comparar-'));
  for (const [nome, conteudo] of Object.entries({ ...BASE, ...mudancas })) {
    if (conteudo === null) continue;
    writeFileSync(path.join(pasta, nome), conteudo);
  }
  return pasta;
};

// retrato da pasta: nomes, tipo e conteudo (para provar que o CLI nao escreve)
const retrato = (pasta) => {
  const saida = [];
  const andar = (atual) => {
    for (const nome of readdirSync(atual).sort()) {
      const cheio = path.join(atual, nome);
      if (statSync(cheio).isDirectory()) {
        saida.push(`D ${nome}`);
        andar(cheio);
      } else {
        saida.push(`F ${nome} ${readFileSync(cheio, 'utf8')}`);
      }
    }
  };
  andar(pasta);
  return saida.join('\n');
};

const rodar = (...pastas) => spawnSync(process.execPath, [SCRIPT, ...pastas], { encoding: 'utf8' });

test('C3 CLI: feeds equivalentes saem com 0 e RESUMO 0', () => {
  const vigente = montarFeed();
  const novo = montarFeed();
  const r = rodar(vigente, novo);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\nRESUMO 0\n$/);
  assert.equal(r.stderr, '');
});

test('C3 CLI: com mudanca sai com 1 e diz qual foi', () => {
  const vigente = montarFeed();
  const novo = montarFeed({ 'feed_info.txt': 'feed_publisher_name,feed_version,feed_start_date,feed_end_date\nInventado,v2,20260101,20261231\n' });
  const r = rodar(vigente, novo);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /feed_version: v1 -> v2/);
  assert.match(r.stdout, /\nRESUMO 1\n$/);
});

test('C3 CLI: uma secao por assunto do relatorio', () => {
  const vigente = montarFeed();
  const novo = montarFeed({ 'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:10:00,08:10:00,P1,1\n' });
  const r = rodar(vigente, novo);
  assert.equal(r.status, 1, r.stderr);
  const secoes = r.stdout.split('\n').filter((l) => ['FEED', 'ROTAS', 'PARTIDAS', 'SERVICOS', 'EXCECOES', 'PONTOS'].includes(l));
  assert.deepEqual(secoes, ['FEED', 'ROTAS', 'PARTIDAS', 'SERVICOS', 'EXCECOES', 'PONTOS']);
});

test('C3 CLI: a saida e ASCII mesmo com acento no feed', () => {
  const vigente = montarFeed();
  const novo = montarFeed({ 'routes.txt': 'route_id,route_short_name\nR1,S\u00e3o\n' });
  const r = rodar(vigente, novo);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /^[\x00-\x7F]*$/);
  assert.ok(r.stdout.includes('+ S?o'));
});

test('C3 CLI: erro de uso sai com 2 e uma linha FALHA USO', () => {
  const pasta = montarFeed();
  for (const args of [[], [pasta], [pasta, pasta, pasta]]) {
    const r = rodar(...args);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^FALHA USO uso: comparar-feed <pasta vigente> <pasta nova>\n$/);
    assert.equal(r.stdout, '');
  }
});

test('C3 CLI: pasta sem arquivo obrigatorio sai com 2 e FALHA LEITURA com o nome', () => {
  const vigente = montarFeed();
  const quebrado = montarFeed({ 'trips.txt': null });
  const r = rodar(vigente, quebrado);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^FALHA LEITURA .*trips\.txt\n$/);
  assert.equal(r.stdout, '');

  const inexistente = rodar(vigente, path.join(vigente, 'nao-existe'));
  assert.equal(inexistente.status, 2);
  assert.match(inexistente.stderr, /^FALHA LEITURA /);
});

test('C3 CLI: so le, nunca escreve nas pastas', () => {
  const vigente = montarFeed();
  const novo = montarFeed({ 'calendar_dates.txt': 'service_id,date,exception_type\nU1,20260401,2\n' });
  const antesVigente = retrato(vigente);
  const antesNovo = retrato(novo);
  const r = rodar(vigente, novo);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(retrato(vigente), antesVigente);
  assert.equal(retrato(novo), antesNovo);
});
