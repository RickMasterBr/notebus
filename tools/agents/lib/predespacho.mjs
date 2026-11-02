import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { extrairCabecalho, lerContrato, ContratoErro } from './contrato.mjs';
import { lerCommitVigente, caminhoGate } from './rodar.mjs';
import { lerAtivasSemApagar } from './trava.mjs';

const MAX_WORKERS = 2;
const HEX = /^[0-9a-f]{7,40}$/i;
const barra = (p) => p.replace(/\\/g, '/');

// so leitura: rev-parse, show, grep, branch --list (o status 1 do grep e "nada achado")
const SO_LEITURA = new Set(['rev-parse', 'show', 'grep', 'branch']);
const gitLer = (repo, args) => {
  if (!SO_LEITURA.has(args[0])) throw new Error(`GIT_COMANDO_PROIBIDO: ${args[0]}`);
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
  } catch (e) {
    if (args[0] === 'grep' && e.status === 1) return '';
    throw e;
  }
};

const SUITE_PASTA = /(^|\s)["']?(\.\/)?tools\/agents\/?["']?(\s|$)/;
const ehSuiteInteira = (cmd) => cmd.includes('**') || SUITE_PASTA.test(barra(cmd));

const leOTexto = (repo, c) => {
  const permitidos = new Set(c.arquivos_permitidos.filter((x) => typeof x === 'string').map(barra));
  const achados = [];
  for (const arq of permitidos) {
    if (/\.test\.[^/]*$/.test(arq)) continue;
    let testes = '';
    try {
      testes = gitLer(repo, ['grep', '-l', '-F', '-e', arq, '-e', path.posix.basename(arq), c.base.commit, '--', '*.test.*']);
    } catch {
      continue; // base inexistente: BASE_VELHA ja avisa
    }
    for (const l of testes.split('\n').filter(Boolean)) {
      const teste = l.slice(c.base.commit.length + 1);
      if (permitidos.has(teste)) continue;
      try {
        if (gitLer(repo, ['show', `${c.base.commit}:${teste}`]).includes('readFileSync')) achados.push({ teste, arq });
      } catch {
        // some entre os dois comandos: ignora
      }
    }
  }
  return achados;
};

// Devolve [{ nivel: 'OK'|'FALTA'|'AVISO', codigo, texto }]; nao escreve em lugar nenhum.
export const conferir = ({ contrato, schemaPath, raiz, repo, manual = false, agora = Date.now() }) => {
  const r = [];
  const add = (nivel, codigo, texto) => r.push({ nivel, codigo, texto });
  const confere = (codigo, problema, ok, nivel = 'FALTA') => (problema ? add(nivel, codigo, problema) : add('OK', codigo, ok));

  let c;
  try {
    c = extrairCabecalho(readFileSync(contrato, 'utf8')).cabecalho;
  } catch (e) {
    if (!(e instanceof ContratoErro)) throw e;
    add('FALTA', 'CONTRATO_INVALIDO', e.erros[0].mensagem);
    return r;
  }
  try {
    c = lerContrato(contrato, { schemaPath });
    add('OK', 'CONTRATO_INVALIDO', 'o contrato passa no schema');
  } catch (e) {
    if (!(e instanceof ContratoErro)) throw e;
    add('FALTA', 'CONTRATO_INVALIDO', `${e.erros[0].caminho} ${e.erros[0].mensagem}`);
  }
  const id = String(c.id ?? '');
  const pista = typeof c.pista === 'string' ? c.pista : '';
  confere('SEM_PISTA_NO_CABECALHO', pista ? '' : 'o contrato nao traz pista', `pista ${pista}`);

  const { branch, commit } = c.base ?? {};
  if (typeof branch !== 'string' || typeof commit !== 'string' || !HEX.test(commit)) {
    add('FALTA', 'BASE_VELHA', 'base.branch ou base.commit ausente ou invalido');
  } else {
    let atual = null;
    try {
      atual = gitLer(repo, ['rev-parse', branch]).trim();
    } catch {
      add('FALTA', 'BASE_VELHA', `nao consegui ler a branch ${branch}`);
    }
    if (atual !== null) confere('BASE_VELHA', atual.startsWith(commit.toLowerCase()) ? '' : `base ${commit} mas ${branch} esta em ${atual.slice(0, 7)}`, `base ${commit} e a ${branch} de agora`);
  }

  const suites = (Array.isArray(c.comandos_validacao) ? c.comandos_validacao : []).filter((x) => typeof x === 'string' && ehSuiteInteira(x));
  confere('SUITE_INTEIRA', suites.length ? `suite inteira no worker: ${suites.join(' | ')}` : '', 'nenhum comando de suite inteira', manual ? 'AVISO' : 'FALTA');

  const workers = lerAtivasSemApagar(raiz, '_trava', agora).length;
  confere('TRAVA_CHEIA', workers >= MAX_WORKERS ? `${workers} despachos ativos (maximo ${MAX_WORKERS})` : '', `${workers} despacho(s) ativo(s)`);
  const gates = lerAtivasSemApagar(raiz, '_trava-gate', agora).length;
  confere('GATE_OCUPADO', gates ? 'ha gate ativo; o gate espera a vez' : '', 'nenhum gate ativo', 'AVISO');

  const velhas = [];
  if (pista && existsSync(path.join(raiz, 'pistas', pista))) velhas.push(`pasta pistas/${pista}`);
  if (id) {
    try {
      if (gitLer(repo, ['branch', '--list', `tarefa/${id}`]).trim()) velhas.push(`branch tarefa/${id}`);
    } catch {
      // sem repo legivel: BASE_VELHA ja falou
    }
  }
  confere('PISTA_ANTIGA', velhas.length ? `ja existe ${velhas.join(' e ')}` : '', 'pista e branch livres');

  let vigente = '';
  try {
    const arq = path.join(raiz, '_gate-bin', 'VIGENTE.txt');
    if (!existsSync(arq)) vigente = 'VIGENTE.txt nao existe';
    else {
      const gate = caminhoGate(raiz, lerCommitVigente(readFileSync(arq, 'utf8')));
      if (!existsSync(gate)) vigente = `a copia do gate nao existe: ${gate}`;
    }
  } catch (e) {
    vigente = e.message;
  }
  confere('GATE_VIGENTE_AUSENTE', vigente, 'gate vigente presente');

  confere('JA_DESPACHADO', id && existsSync(path.join(raiz, '_despacho', id)) ? `_despacho/${id} ja existe` : '', 'nunca despachado', 'AVISO');

  const le = Array.isArray(c.arquivos_permitidos) && typeof commit === 'string' && HEX.test(commit) ? leOTexto(repo, c) : [];
  if (le.length) for (const { teste, arq } of le) add('AVISO', 'LE_O_TEXTO', `${teste} le o texto de ${arq}`);
  else add('OK', 'LE_O_TEXTO', 'nenhum teste fora da lista le o texto de arquivo permitido');
  return r;
};

export const veredito = (linhas) => (linhas.some((l) => l.nivel === 'FALTA') ? { texto: 'NAO PRONTO', codigo: 1 } : { texto: 'PRONTO', codigo: 0 });
export const formatar = (l) => `${l.nivel} ${l.codigo} ${l.texto}`;
