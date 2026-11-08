import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { extrairCabecalho, lerContrato, ContratoErro } from './contrato.mjs';
import { lerCommitVigente, caminhoGate } from './rodar.mjs';
import { lerAtivasSemApagar, MAX_DESPACHOS } from './trava.mjs';

const HEX = /^[0-9a-f]{7,40}$/i;
const barra = (p) => p.replace(/\\/g, '/');

// lista fechada do agy (A48); npm run test e negado
const PERMISSAO_AGY = [/^git (status|diff|log|show|add|commit)( |$)/, /^npm test( |$)/, /^npm run typecheck( |$)/, /^npx vitest( |$)/];
const ENCADEIA = /;|&&|\|/; // cobre | e ||
const comandoLiberado = (harness, cmd) => {
  if (harness !== 'agy' && harness !== 'opencode') return true;
  const c = cmd.trim();
  if (ENCADEIA.test(c)) return false;
  return harness === 'opencode' || PERMISSAO_AGY.some((re) => re.test(c));
};
const topo = (p) => (p.includes('/') ? p.split('/')[0] : '');

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
        const corpo = gitLer(repo, ['show', `${c.base.commit}:${teste}`]);
        // so o nome do arquivo no texto: conta apenas na mesma pasta de topo (A48/E-33)
        if (corpo.includes('readFileSync') && (corpo.includes(arq) || topo(teste) === topo(arq))) achados.push({ teste, arq });
      } catch {
        // some entre os dois comandos: ignora
      }
    }
  }
  return achados;
};

// Devolve [{ nivel: 'OK'|'FALTA'|'AVISO', codigo, texto }]; nao escreve em lugar nenhum.
// nomes de imagem dos processos; fora do Windows ou em qualquer falha, lista vazia
export const processosPadrao = () => {
  if (process.platform !== 'win32') return [];
  try {
    const saida = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
    return saida.split('\n').map((l) => /^"([^"]*)"/.exec(l.trim())?.[1]).filter(Boolean);
  } catch {
    return [];
  }
};

export const conferir = ({ contrato, schemaPath, raiz, repo, manual = false, agora = Date.now(), processos = processosPadrao }) => {
  const r = [];
  const add = (nivel, codigo, texto) => r.push({ nivel, codigo, texto });
  const confere = (codigo, problema, ok, nivel = 'FALTA') => (problema ? add(nivel, codigo, problema) : add('OK', codigo, ok));

  let c;
  let texto = '';
  try {
    texto = readFileSync(contrato, 'utf8');
    c = extrairCabecalho(texto).cabecalho;
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

  const harness = c.executor?.harness;
  const todos = (Array.isArray(c.comandos_validacao) ? c.comandos_validacao : []).filter((x) => typeof x === 'string');
  const negados = todos.filter((x) => !comandoLiberado(harness, x));
  const negLista = negados.slice(0, 3).join(' | ') + (negados.length > 3 ? ` e mais ${negados.length - 3}` : '');
  confere('PERMISSAO_DO_EXECUTOR', negados.length ? `comando fora da permissao do ${harness}: ${negLista}` : '', `comandos dentro da permissao do ${harness}`);
  if (harness === 'agy') confere('AGY_SEM_REGRA_DE_ESPERA', /segundo plano/i.test(texto) ? '' : 'o contrato nao traz a regra de segundo plano', 'o contrato traz a regra de segundo plano', 'AVISO');

  const workers = lerAtivasSemApagar(raiz, '_trava', agora).length;
  confere('TRAVA_CHEIA', workers >= MAX_DESPACHOS ? `${workers} despachos ativos (maximo ${MAX_DESPACHOS})` : '', `${workers} despacho(s) ativo(s)`);
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

  const cmds = barra((Array.isArray(c.comandos_validacao) ? c.comandos_validacao : []).filter((x) => typeof x === 'string').join('\n'));
  const fora = [...new Set(le.map((x) => x.teste))].filter((t) => !cmds.includes(barra(t)) && !cmds.includes(path.posix.basename(barra(t))));
  const lista = fora.slice(0, 5).join(', ') + (fora.length > 5 ? ` e mais ${fora.length - 5}` : '');
  confere('LE_O_TEXTO_SEM_COMANDO', fora.length ? `teste que le o texto fora dos comandos de validacao: ${lista}` : '', 'todo teste que le o texto de arquivo permitido esta nos comandos', manual ? 'AVISO' : 'FALTA');

  const ini = texto.search(/^## 10\./m);
  const resto = ini < 0 ? '' : texto.slice(ini);
  const fim = resto.slice(1).search(/^## 11\./m);
  const secao10 = fim < 0 ? resto : resto.slice(0, fim + 1);
  confere('SEM_FRASE_CRITERIOS', /palavra por palavra/i.test(secao10) ? '' : 'a secao ## 10. do contrato falta ou nao manda copiar os criterios palavra por palavra', 'a secao ## 10. manda copiar os criterios palavra por palavra', manual ? 'AVISO' : 'FALTA');

  let nomes = [];
  try {
    nomes = processos();
  } catch {
    // sem lista de processos: nao avisa
  }
  confere('EDITOR_ABERTO', nomes.some((n) => /^code(\.exe)?$/i.test(String(n).trim())) ? 'feche o VS Code antes do rodar (A16)' : '', 'VS Code fechado', 'AVISO');
  return r;
};

export const veredito = (linhas) => (linhas.some((l) => l.nivel === 'FALTA') ? { texto: 'NAO PRONTO', codigo: 1 } : { texto: 'PRONTO', codigo: 0 });
export const formatar = (l) => `${l.nivel} ${l.codigo} ${l.texto}`;
