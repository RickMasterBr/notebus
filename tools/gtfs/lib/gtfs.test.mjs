// Testes do leitor GTFS (C1). Feeds inventados, montados em pasta temporaria.
// Nenhum dado real da MOBILIS (A13) e nenhum relogio real (A6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lerFeed, lerCsv, ARQUIVOS_OBRIGATORIOS, GtfsErro } from './gtfs.mjs';

const BASE = {
  'routes.txt': 'route_id,route_short_name\nR1,1\n',
  'trips.txt': 'route_id,service_id,trip_id,direction_id\nR1,U1,T1,0\n',
  'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,P1,1\n',
  'stops.txt': 'stop_id,stop_code,stop_lat,stop_lon\nP1,100,39.7436,-8.8071\n',
  'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nU1,1,1,1,1,1,0,0,20260101,20261231\n',
};

// arquivo com null = nao criado (para testar ausente)
const montarFeed = (conteudo = {}) => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'notebus-gtfs-'));
  for (const [nome, texto] of Object.entries({ ...BASE, ...conteudo })) {
    if (texto === null) continue;
    writeFileSync(path.join(pasta, nome), texto);
  }
  return pasta;
};

const semPasta = (feed) => {
  const { pasta, ...resto } = feed;
  return resto;
};

test('C1 gtfs: aceita BOM no inicio do arquivo', () => {
  const pasta = montarFeed({ 'routes.txt': '\uFEFFroute_id,route_short_name\nR1,1\n' });
  const feed = lerFeed(pasta);
  assert.equal(feed.rotas.length, 1);
  assert.equal(feed.rotas[0].id, 'R1');
  assert.equal(feed.rotas[0].nomeCurto, '1');
  assert.equal(lerCsv('\uFEFFa,b\n1,2\n').cabecalho[0], 'a');
});

test('C1 gtfs: CRLF e LF dao o mesmo feed', () => {
  const crlf = {};
  for (const [nome, texto] of Object.entries(BASE)) crlf[nome] = texto.replace(/\n/g, '\r\n');
  const comCrlf = lerFeed(montarFeed(crlf));
  const comLf = lerFeed(montarFeed());
  assert.deepEqual(semPasta(comCrlf), semPasta(comLf));
  assert.equal(comLf.rotas[0].id, 'R1');
});

test('C1 gtfs: campo entre aspas com virgula e aspas duplas escapadas', () => {
  const pasta = montarFeed({
    'routes.txt': 'route_id,route_short_name,route_long_name\nR1,"1,2","diz ""oi"""\nR2,"3","pra""ca"\n',
  });
  const feed = lerFeed(pasta);
  assert.deepEqual(feed.rotas, [
    { id: 'R1', nomeCurto: '1,2' },
    { id: 'R2', nomeCurto: '3' },
  ]);
  const lido = lerCsv('a,b\r\n"1,2","diz ""oi"""');
  assert.deepEqual(lido.cabecalho, ['a', 'b']);
  assert.deepEqual(lido.linhas, [['1,2', 'diz "oi"']]);
});

test('C1 gtfs: arquivos opcionais ausentes nao quebram a leitura', () => {
  const feed = lerFeed(montarFeed());
  assert.equal(feed.info, null);
  assert.deepEqual(feed.excecoes, []);
});

test('C1 gtfs: arquivos opcionais presentes sao lidos', () => {
  const pasta = montarFeed({
    'feed_info.txt': 'feed_publisher_name,feed_version,feed_start_date,feed_end_date\nInventado,v9,20260101,20261231\n',
    'calendar_dates.txt': 'service_id,date,exception_type\nU1,20260401,2\nU1,20260402,2\n',
  });
  const feed = lerFeed(pasta);
  assert.deepEqual(feed.info, { versao: 'v9', inicio: '20260101', fim: '20261231' });
  assert.deepEqual(feed.excecoes, [
    { servico: 'U1', data: '20260401', tipo: '2' },
    { servico: 'U1', data: '20260402', tipo: '2' },
  ]);
});

test('C1 gtfs: arquivo obrigatorio ausente da erro com o nome do arquivo', () => {
  for (const nome of ARQUIVOS_OBRIGATORIOS) {
    const pasta = montarFeed({ [nome]: null });
    assert.throws(
      () => lerFeed(pasta),
      (e) => e instanceof GtfsErro && e.codigo === 'ARQUIVO_AUSENTE' && e.arquivo === nome && e.message.includes(nome),
      `faltava ${nome}`,
    );
  }
});

test('C1 gtfs: le primeiro ponto, sequencia numerica e hora que passa de 24h', () => {
  const pasta = montarFeed({
    'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,,08:05:00,P1,1\nT1,08:10:00,08:10:00,P2,2\nT1,25:30:00,,P1,3\n',
  });
  const feed = lerFeed(pasta);
  assert.equal(feed.horarios[0].hora, '08:05:00'); // sem departure, usa arrival
  assert.equal(feed.horarios[2].hora, '25:30:00'); // departure vazio, usa arrival
  assert.equal(feed.horarios[2].sequencia, 3);
  assert.equal(feed.paradas[0].lat, 39.7436);
  assert.equal(feed.paradas[0].lon, -8.8071);
  assert.deepEqual(feed.calendario[0].dias, ['1', '1', '1', '1', '1', '0', '0']);
});

test('C1b gtfs: timepoint 1 e vazio dao controle verdadeiro, 0 da falso', () => {
  const pasta = montarFeed({
    'stop_times.txt':
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence,timepoint\nT1,08:00:00,08:00:00,P1,1,1\nT1,08:05:00,08:05:00,P2,2,\nT1,08:10:00,08:10:00,P3,3,0\n',
  });
  assert.deepEqual(
    lerFeed(pasta).horarios.map((h) => h.controle),
    [true, true, false],
  );
});

test('C1b gtfs: sem a coluna timepoint o controle e verdadeiro', () => {
  assert.equal(lerFeed(montarFeed()).horarios[0].controle, true);
});

test('C1b gtfs: stop_name sai aparado em nome', () => {
  const pasta = montarFeed({ 'stops.txt': 'stop_id,stop_code,stop_name,stop_lat,stop_lon\nP1,100,  Praca Inventada  ,39.7436,-8.8071\n' });
  assert.equal(lerFeed(pasta).paradas[0].nome, 'Praca Inventada');
});

test('C1b gtfs: os campos de antes seguem iguais', () => {
  const feed = lerFeed(montarFeed());
  assert.deepEqual(feed.horarios, [{ viagem: 'T1', parada: 'P1', sequencia: 1, hora: '08:00:00', controle: true }]);
  assert.deepEqual(feed.paradas, [{ id: 'P1', codigo: '100', nome: '', lat: 39.7436, lon: -8.8071 }]);
  assert.deepEqual(feed.viagens, [{ id: 'T1', rota: 'R1', servico: 'U1', direcao: '0' }]);
});
