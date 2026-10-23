import { execFileSync } from 'node:child_process';

// o gate so le: qualquer outro subcomando e erro de programacao, nao de uso
const LEITURA = new Set(['rev-parse', 'status', 'ls-files', 'ls-tree', 'diff', 'merge-base', 'rev-list', 'show', 'cat-file', 'config']);
const CONFIG_LEITURA = ['--list', '-l', '--get'];

export const git = (pista, args) => {
  if (!LEITURA.has(args[0])) throw new Error(`GIT_COMANDO_PROIBIDO: ${args[0]}`);
  if (args[0] === 'config' && !args.some((a) => CONFIG_LEITURA.includes(a))) throw new Error('GIT_COMANDO_PROIBIDO: config sem --list/--get');
  // diff e show nao rodam programa da pista (diff.external, textconv): o worker pode mexer no config e no .gitattributes
  const resto = args[0] === 'diff' || args[0] === 'show' ? [args[0], '--no-ext-diff', '--no-textconv', ...args.slice(1)] : args;
  const { GIT_EXTERNAL_DIFF: _, ...env } = process.env;
  // fsmonitor off: um config da pista nao pode fazer o status rodar comando; sem lock opcional o status nao regrava o indice
  return execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.quotepath=off', '-C', pista, ...resto], {
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1 << 28,
    env: { ...env, GIT_OPTIONAL_LOCKS: '0' },
  });
};

// devolve { ok, out } em vez de lancar quando o git sai com 1 (ex.: merge-base --is-ancestor)
export const tenta = (pista, args) => {
  try {
    return { ok: true, out: git(pista, args) };
  } catch (e) {
    if (typeof e.status === 'number') return { ok: false, status: e.status };
    throw e;
  }
};

export const parseZ = (buf) => {
  const partes = buf.toString('utf8').split('\0');
  if (partes.at(-1) === '') partes.pop();
  return partes;
};

export const nomeStatus = (letra) => ({ A: 'adicionado', M: 'modificado', D: 'apagado', T: 'tipo mudado' })[letra] ?? letra;
