import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lerJson } from './lib/json.mjs';
import { extrairCabecalho, ContratoErro } from './lib/contrato.mjs';
import { CABECALHO, COLUNAS, ler, linha } from './lib/csv.mjs';
import { esqueletoDoRegistro, linhaDoDespacho } from './lib/registro.mjs';
import { resumir, SEMANA_VALIDA } from './lib/resumo.mjs';

class Falha extends Error {
  constructor(codigo, texto) {
    super(texto);
    this.codigo = codigo;
  }
}

const USO = 'uso: trace.mjs <contrato.md> --raiz <pasta> --csv <arquivo> (--registros <pasta> | --so-csv) | anotar <id> --csv <arquivo> [--pct n] [--retrabalho n] [--intervencoes n] [--mutantes n] | resumo --csv <arquivo> [--semana AAAA-Www] [--saida <arquivo.md>]';
const FLAGS = {
  trace: { valor: ['--raiz', '--csv', '--registros'], bool: ['--so-csv'] },
  anotar: { valor: ['--csv', '--pct', '--retrabalho', '--intervencoes', '--mutantes'], bool: [] },
  resumo: { valor: ['--csv', '--semana', '--saida'], bool: [] },
};
// flag do anotar -> coluna do CSV
const COLUNA_RICK = { '--pct': 'pct_limite', '--retrabalho': 'retrabalho', '--intervencoes': 'intervencoes_rick', '--mutantes': 'mutantes_sobreviventes' };

const lerArgs = (argv) => {
  const modo = argv[0] === 'anotar' || argv[0] === 'resumo' ? argv[0] : 'trace';
  const o = { modo, posicionais: [] };
  const { valor, bool } = FLAGS[modo];
  const resto = modo === 'trace' ? argv : argv.slice(1);
  for (let i = 0; i < resto.length; i++) {
    const a = resto[i];
    if (bool.includes(a)) o[a] = true;
    else if (valor.includes(a)) {
      if (resto[i + 1] === undefined) throw new Falha('USO', `${a} pede um valor`);
      o[a] = resto[++i];
    } else if (a.startsWith('--')) throw new Falha('USO', `flag desconhecida: ${a}`);
    else o.posicionais.push(a);
  }
  const esperados = modo === 'resumo' ? 0 : 1;
  if (o.posicionais.length !== esperados) throw new Falha('USO', USO);
  if (!o['--csv']) throw new Falha('USO', `--csv e obrigatorio. ${USO}`);
  return o;
};

const lerCsv = (arquivo) => {
  if (!existsSync(arquivo)) throw new Falha('CSV_AUSENTE', arquivo);
  let csv;
  try {
    csv = ler(readFileSync(arquivo, 'utf8'));
  } catch (e) {
    throw new Falha(e.code ?? 'CSV_INVALIDO', e.message);
  }
  if (csv.cabecalho.join(',') !== COLUNAS.join(',')) throw new Falha('CSV_CABECALHO', `cabecalho diferente do esperado em ${arquivo}`);
  return csv;
};

const lerObrigatorio = (arquivo, ausente, ilegivel) => {
  if (!existsSync(arquivo)) throw new Falha(ausente, arquivo);
  try {
    return lerJson(arquivo);
  } catch (e) {
    throw new Falha(ilegivel, `${arquivo}: ${e.message}`);
  }
};

const trace = (o) => {
  if (!o['--raiz']) throw new Falha('USO', `--raiz e obrigatorio. ${USO}`);
  if (!o['--registros'] && !o['--so-csv']) throw new Falha('USO', `--registros (ou --so-csv) e obrigatorio. ${USO}`);
  const arquivoContrato = path.resolve(o.posicionais[0]);
  if (!existsSync(arquivoContrato)) throw new Falha('USO', `contrato nao encontrado: ${arquivoContrato}`);
  let contrato;
  try {
    contrato = extrairCabecalho(readFileSync(arquivoContrato, 'utf8')).cabecalho;
  } catch (e) {
    if (e instanceof ContratoErro) throw new Falha('CONTRATO_INVALIDO', e.message);
    throw e;
  }
  const id = contrato.id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9][\w.-]*$/.test(id)) throw new Falha('CONTRATO_INVALIDO', `id invalido no contrato: ${id}`);

  // le tudo antes de escrever qualquer coisa
  const dir = path.join(path.resolve(o['--raiz']), '_despacho', id);
  const meta = lerObrigatorio(path.join(dir, 'meta.json'), 'SEM_META', 'META_ILEGIVEL');
  const relatorio = lerObrigatorio(path.join(dir, 'relatorio.json'), 'SEM_RELATORIO', 'RELATORIO_ILEGIVEL');
  if (meta.id !== id) throw new Falha('ID_DIFERENTE', `meta.json traz ${meta.id}, contrato traz ${id}`);
  const arquivoGate = path.join(dir, 'gate.json');
  const gate = existsSync(arquivoGate) ? lerObrigatorio(arquivoGate, 'SEM_GATE', 'GATE_ILEGIVEL') : null;
  if (gate && gate.versao !== 1) throw new Falha('GATE_VERSAO', `gate.json versao ${gate.versao}, so a 1 e conhecida`);
  const historico = path.join(dir, 'gate-historico');
  const rodadas = existsSync(historico) ? readdirSync(historico).length : 0;

  const csvArq = path.resolve(o['--csv']);
  const avisos = [];
  const existente = existsSync(csvArq) && statSync(csvArq).size > 0;
  let jaRegistrado = false;
  if (existente) {
    const { linhas } = lerCsv(csvArq);
    const [iT, iI] = [COLUNAS.indexOf('tarefa'), COLUNAS.indexOf('inicio_despacho')];
    jaRegistrado = linhas.some((l) => l[iT] === id && l[iI] === String(meta.inicio ?? ''));
  }
  const registro = o['--so-csv'] ? null : path.join(path.resolve(o['--registros']), `${id}.md`);
  const registroExiste = registro !== null && existsSync(registro);

  const valores = linhaDoDespacho({ contrato, meta, relatorio, gate, rodadas });
  if (jaRegistrado) avisos.push('JA_REGISTRADO');
  else {
    mkdirSync(path.dirname(csvArq), { recursive: true });
    if (!existente) writeFileSync(csvArq, CABECALHO + linha(valores));
    else {
      const bytes = readFileSync(csvArq);
      appendFileSync(csvArq, (bytes[bytes.length - 1] === 0x0a ? '' : '\n') + linha(valores));
    }
  }
  if (registroExiste) avisos.push('REGISTRO_EXISTE');
  else if (registro) {
    mkdirSync(path.dirname(registro), { recursive: true });
    writeFileSync(registro, esqueletoDoRegistro({ contrato, meta, relatorio, gate }));
  }
  avisos.forEach((a) => console.error(`AVISO ${a}`));
  return `OK ${id} ${jaRegistrado ? 'ja estava no csv' : 'linha acrescentada'}`;
};

const anotar = (o) => {
  const id = o.posicionais[0];
  const mudancas = Object.entries(COLUNA_RICK).filter(([flag]) => o[flag] !== undefined);
  if (!mudancas.length) throw new Falha('USO', `nada a anotar. ${USO}`);
  for (const [flag] of mudancas) if (!/^\d+$/.test(o[flag])) throw new Falha('USO', `${flag} pede um inteiro: ${o[flag]}`);
  const csvArq = path.resolve(o['--csv']);
  const { linhas } = lerCsv(csvArq);
  const i = linhas.map((l) => l[COLUNAS.indexOf('tarefa')]).lastIndexOf(id);
  if (i < 0) throw new Falha('ID_INEXISTENTE', `${id} nao esta em ${csvArq}`);
  for (const [flag, coluna] of mudancas) linhas[i][COLUNAS.indexOf(coluna)] = o[flag];
  writeFileSync(csvArq, CABECALHO + linhas.map(linha).join(''));
  return `OK ${id} anotado: ${mudancas.map(([f, c]) => `${c}=${o[f]}`).join(' ')}`;
};

// realpath so quando o arquivo existe; o Windows nao distingue maiusculas; hardlink: mesmo dev e ino
const mesmoArquivo = (a, b) => {
  const real = (f) => (existsSync(f) ? realpathSync(f) : f);
  const [x, y] = [real(a), real(b)];
  if (process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y) return true;
  if (!existsSync(a) || !existsSync(b)) return false;
  const [sa, sb] = [statSync(a), statSync(b)];
  return sa.dev === sb.dev && sa.ino === sb.ino;
};

const resumo = (o) => {
  if (o['--semana'] !== undefined && !SEMANA_VALIDA.test(o['--semana'])) throw new Falha('USO', `--semana pede AAAA-Www: ${o['--semana']}`);
  const csvArq = path.resolve(o['--csv']);
  const { linhas } = lerCsv(csvArq);
  if (o['--saida'] && mesmoArquivo(csvArq, path.resolve(o['--saida']))) throw new Falha('SAIDA_IGUAL_CSV', `--saida e o proprio csv: ${csvArq}`);
  const { texto, avisos } = resumir(linhas, { semana: o['--semana'] });
  avisos.forEach((a) => console.error(`AVISO ${a.codigo} ${a.mensagem}`));
  if (o['--saida']) writeFileSync(path.resolve(o['--saida']), texto);
  process.stdout.write(texto);
  return null;
};

try {
  const o = lerArgs(process.argv.slice(2));
  const msg = { trace, anotar, resumo }[o.modo](o);
  if (msg) console.log(msg);
} catch (e) {
  if (e instanceof Falha) {
    console.error(`FALHA ${e.codigo} ${e.message}`);
  } else {
    console.error(`FALHA ERRO_INESPERADO ${e.stack ?? e}`);
  }
  process.exitCode = 2;
}
