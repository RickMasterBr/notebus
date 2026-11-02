// Leitor de feed GTFS em Node puro (D-254): so node: embutido, sem dependencia.
// Le uma pasta com os arquivos .txt em CSV e devolve estruturas em memoria.
import { readFileSync } from 'node:fs';
import path from 'node:path';

// C1: estes cinco sao obrigatorios; calendar_dates e feed_info sao opcionais
export const ARQUIVOS_OBRIGATORIOS = ['routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt', 'calendar.txt'];
export const ARQUIVOS_OPCIONAIS = ['calendar_dates.txt', 'feed_info.txt'];
export const DIAS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// erro de leitura com codigo e nome do arquivo (o CLI mostra em FALHA)
export class GtfsErro extends Error {
  constructor(codigo, mensagem, arquivo) {
    super(mensagem);
    this.name = 'GtfsErro';
    this.codigo = codigo;
    this.arquivo = arquivo;
  }
}

// CSV -> { cabecalho, linhas (arrays), registros (objetos)}
// aceita BOM no inicio, fim de linha CRLF ou LF, campos entre aspas com virgula
// e aspas duplas escapadas ("")
export const lerCsv = (texto) => {
  const t = String(texto ?? '').replace(/^\uFEFF/, '');
  const registros = [];
  let campo = '';
  let atual = [];
  let aspas = false;
  let pendente = false; // ha algo na linha corrente (evita linha vazia fantasma no fim)
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"' && campo === '') {
      aspas = true;
      pendente = true;
    } else if (c === ',') {
      atual.push(campo);
      campo = '';
      pendente = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      if (pendente || campo !== '') {
        atual.push(campo);
        registros.push(atual);
      }
      atual = [];
      campo = '';
      pendente = false;
    } else {
      campo += c;
      pendente = true;
    }
  }
  if (aspas) throw new GtfsErro('CSV_INVALIDO', 'aspas sem fechamento no CSV');
  if (pendente || campo !== '') {
    atual.push(campo);
    registros.push(atual);
  }
  const [cabecalho = [], ...linhas] = registros;
  const nomes = cabecalho;
  const objetos = linhas.map((l) => {
    const o = {};
    nomes.forEach((nome, i) => {
      o[nome] = l[i] ?? '';
    });
    return o;
  });
  return { cabecalho: nomes, linhas, registros: objetos };
};

const lerArquivo = (pasta, nome, obrigatorio) => {
  const arquivo = path.join(pasta, nome);
  let texto;
  try {
    texto = readFileSync(arquivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT' && !obrigatorio) return null;
    if (e.code === 'ENOENT') throw new GtfsErro('ARQUIVO_AUSENTE', `arquivo obrigatorio ausente: ${nome}`, nome);
    throw new GtfsErro('ARQUIVO_ILEGIVEL', `nao foi possivel ler ${nome}: ${e.code ?? e.message}`, nome);
  }
  try {
    return lerCsv(texto).registros;
  } catch (e) {
    throw new GtfsErro(e.codigo ?? 'CSV_INVALIDO', `${nome}: ${e.message}`, nome);
  }
};

const texto = (v) => (v === undefined || v === null ? '' : String(v));
const numero = (v) => (texto(v).trim() === '' ? Number.NaN : Number(v));

// le a pasta inteira. Estrutura devolvida:
// { pasta, info, rotas, viagens, horarios, paradas, calendario, excecoes }
export const lerFeed = (pasta) => {
  const conteudo = {};
  for (const nome of ARQUIVOS_OBRIGATORIOS) conteudo[nome] = lerArquivo(pasta, nome, true);
  for (const nome of ARQUIVOS_OPCIONAIS) conteudo[nome] = lerArquivo(pasta, nome, false);

  const info = (conteudo['feed_info.txt'] ?? [])[0] ?? null;

  return {
    pasta,
    info: info
      ? {
          versao: texto(info.feed_version),
          inicio: texto(info.feed_start_date),
          fim: texto(info.feed_end_date),
        }
      : null,
    rotas: conteudo['routes.txt'].map((r) => ({ id: texto(r.route_id), nomeCurto: texto(r.route_short_name) })),
    viagens: conteudo['trips.txt'].map((t) => ({
      id: texto(t.trip_id),
      rota: texto(t.route_id),
      servico: texto(t.service_id),
      direcao: texto(t.direction_id),
    })),
    horarios: conteudo['stop_times.txt'].map((s) => ({
      viagem: texto(s.trip_id),
      parada: texto(s.stop_id),
      sequencia: numero(s.stop_sequence),
      // departure_time manda; arrival_time e o recuo (formato HH:MM:SS, pode passar de 24h)
      hora: texto(s.departure_time) || texto(s.arrival_time),
    })),
    paradas: conteudo['stops.txt'].map((s) => ({
      id: texto(s.stop_id),
      codigo: texto(s.stop_code),
      lat: numero(s.stop_lat),
      lon: numero(s.stop_lon),
    })),
    calendario: conteudo['calendar.txt'].map((c) => ({
      servico: texto(c.service_id),
      dias: DIAS.map((dia) => texto(c[dia])),
      inicio: texto(c.start_date),
      fim: texto(c.end_date),
    })),
    excecoes: (conteudo['calendar_dates.txt'] ?? []).map((e) => ({
      servico: texto(e.service_id),
      data: texto(e.date),
      tipo: texto(e.exception_type),
    })),
  };
};
