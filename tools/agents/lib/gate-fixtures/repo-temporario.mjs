import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retrato } from '../retrato.mjs';
import { montar } from '../gate/contexto.mjs';

const AGENTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export { gateBin };
export const AREAS = ['packages/domain/', 'apps/mobile/src/sheets/StackedSheet.tsx', 'apps/mobile/src/sheets/stack.ts', 'apps/mobile/src/data/noDirectClock.test.ts', 'apps/mobile/src/db/schema.ts', 'apps/mobile/src/db/backup.ts'];
export const ID = 't-teste';
export const BRANCH = `tarefa/${ID}`;
export const PISTA = 'pista-teste';

const TESTE = `import { describe, it, expect } from 'vitest';
describe('x', () => {
  it('a', () => { expect(1).toBe(1); expect(2).toBe(2); });
  it('b', () => { expect(3).toBe(3); });
  it('c', () => { expect(4).toBe(4); expect(5).toBe(5); });
});
`;
const BASE = {
  '.gitignore': 'node_modules\n.expo/\ndist/\ncoverage/\n*.tsbuildinfo\n',
  'package.json': '{}\n',
  'packages/domain/index.ts': 'export const d = 1;\n',
  'apps/mobile/src/sheets/StackedSheet.tsx': 'export const s = 1;\n',
  'apps/mobile/src/sheets/stack.ts': 'export const st = 1;\n',
  'apps/mobile/src/data/noDirectClock.test.ts': 'export const n = 1;\n',
  'apps/mobile/src/db/schema.ts': 'export const sc = 1;\n',
  'apps/mobile/src/db/backup.ts': 'export const b = 1;\n',
  'src/exemplo.test.ts': TESTE,
  'src/__snapshots__/exemplo.test.ts.snap': 'exports[`a`] = `1`;\n',
  'tools/agents/hooks/protected-paths.mjs': 'export const x = 1;\n',
};

let copia;
// o gate roda de uma copia fora de qualquer repositorio temporario (G00 recusa o contrario)
const gateBin = () => {
  if (copia) return copia;
  const raiz = mkdtempSync(path.join(tmpdir(), 'gate-bin-'));
  const dest = path.join(raiz, 'tools', 'agents');
  cpSync(AGENTS, dest, { recursive: true, filter: (f) => !/[\\/](?:x|gate-fixtures)$/.test(f) && !f.endsWith('.test.mjs') });
  copia = path.join(dest, 'gate.mjs');
  process.on('exit', () => rmSync(raiz, { recursive: true, force: true }));
  return copia;
};

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export const criarRepo = ({ modo = 'manual', contrato: sobre = {} } = {}) => {
  const T = mkdtempSync(path.join(tmpdir(), 'gate-t-'));
  const repo = path.join(T, 'notebus');
  const pista = path.join(T, 'pistas', PISTA);
  mkdirSync(repo, { recursive: true });
  mkdirSync(path.join(T, 'pistas'), { recursive: true });
  sh(repo, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['core.ignorecase', 'false'], ['user.name', 't'], ['user.email', 't@t'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) sh(repo, 'config', k, v);
  const escreve = (raiz, rel, txt) => {
    mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    writeFileSync(path.join(raiz, rel), txt);
  };
  for (const [k, v] of Object.entries(BASE)) escreve(repo, k, v);
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '-q', '-m', 'base');
  const base = sh(repo, 'rev-parse', 'HEAD');
  sh(repo, 'worktree', 'add', '-q', '-b', BRANCH, pista, base);
  // node_modules ligado a uma pasta fora do repositorio, como as juncoes do despacho
  mkdirSync(path.join(T, 'fora', 'nm'), { recursive: true });
  symlinkSync(path.join(T, 'fora', 'nm'), path.join(pista, 'node_modules'), 'junction');

  const despacho = modo === 'despacho';
  const dirDespacho = path.join(T, '_despacho', ID);
  const t = {
    T, repo, pista, base, modo, dirDespacho,
    saida: despacho ? dirDespacho : path.join(T, 'saida'),
    contratoPath: path.join(T, 'contrato.md'),
    relatorioPath: despacho ? path.join(dirDespacho, 'relatorio.json') : path.join(pista, '.agent', 'report.json'),
    g: (...args) => sh(pista, ...args),
    gm: (...args) => sh(repo, ...args),
    escrever: (rel, txt, raiz = pista) => escreve(raiz, rel, txt),
    commitar: (arquivos, msg = 'tarefa') => {
      for (const [k, v] of Object.entries(arquivos)) escreve(pista, k, v);
      sh(pista, 'add', '-A', '--', '.', ':!.agent');
      sh(pista, 'commit', '-q', '-m', msg);
    },
    head: () => sh(pista, 'rev-parse', 'HEAD'),
    // commita direto no indice, sem tocar o disco: caminho com maiuscula trocada e symlink (modo 120000) sem privilegio no Windows
    commitarNoIndice: (rel, txt, modo = '100644') => {
      const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: pista, input: txt, encoding: 'utf8' }).trim();
      sh(pista, 'update-index', '--add', '--cacheinfo', `${modo},${blob},${rel}`);
      sh(pista, 'commit', '-q', '-m', 'indice');
    },
  };
  t.cabecalho = {
    id: ID, modo: 'agente normal', executor: { harness: 'claude', modelo: 'sonnet' },
    base: { branch: 'main', commit: base }, pista: PISTA,
    arquivos_permitidos: ['src/alvo/'], comandos_validacao: ['node --version'],
    limites: { turnos: 10, minutos: 5 }, criterios: ['C1 um', 'C2 dois'],
    ...sobre,
  };
  t.gravarContrato = (cab = t.cabecalho, { copiar = true } = {}) => {
    const md = `# Contrato\n\n\`\`\`json contrato\n${JSON.stringify(cab, null, 2)}\n\`\`\`\n`;
    writeFileSync(t.contratoPath, md);
    if (copiar) escreve(pista, '.agent/contrato.md', md);
    else rmSync(path.join(pista, '.agent', 'contrato.md'), { force: true });
    return md;
  };
  t.gravarRelatorio = (parcial = {}) => {
    const cab = t.cabecalho;
    const r = {
      tarefa: ID, branch: BRANCH, commit: t.head().slice(0, 7), arquivos_mudados: [], fora_do_pedido: [], comandos: [],
      testes_novos_por_arquivo: {}, itens: cab.criterios.map((c) => ({ criterio: c, status: 'provado_por_teste', evidencia: 'teste x' })),
      resultado: 'ok', duvidas: [], ideias_novas: [], ...parcial,
    };
    escreve(path.dirname(t.relatorioPath), path.basename(t.relatorioPath), JSON.stringify(r, null, 2));
    return r;
  };
  t.gravarMeta = (extra = {}) => {
    escreve(dirDespacho, 'meta.json', JSON.stringify({ id: ID, duracao_s: 10, retrato: retrato({ repo }), ...extra }, null, 2));
  };
  // estado "tarefa honesta": um commit dentro da lista, contrato e relatorio validos
  t.pronto = (arquivos = { 'src/alvo/a.ts': 'export const a = 1;\n' }) => {
    t.gravarContrato();
    t.commitar(arquivos);
    t.gravarRelatorio();
    if (despacho) t.gravarMeta();
  };
  t.argv = (extra = []) => {
    const args = [t.contratoPath, '--repo', repo, '--raiz', T];
    if (!despacho) args.push('--pista', pista, '--relatorio', t.relatorioPath, '--branch', BRANCH, '--saida', t.saida);
    return [...args, ...extra];
  };
  t.ctx = (extra = []) => montar(t.argv(extra), { gatePath: path.join(AGENTS, 'gate.mjs') });
  t.bruto = (args, script = gateBin()) => {
    const r = spawnSync(process.execPath, [script, ...args], { cwd: T, encoding: 'utf8' });
    return { codigo: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  };
  t.rodar = (extra = []) => {
    const r = t.bruto(t.argv(extra));
    const arq = path.join(t.saida, 'gate.json');
    const gate = existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : null;
    const achar = (id, codigo) => gate?.verificacoes.filter((v) => v.id === id && (codigo === undefined || v.codigo === codigo)) ?? [];
    return {
      ...r, gate,
      // codigos de falha (ou de qualquer status) de uma verificacao
      falhas: (id) => achar(id).filter((v) => v.status === 'falha').map((v) => v.codigo),
      tem: (id, codigo, status) => achar(id, codigo).some((v) => (status ? v.status === status : true)),
    };
  };
  t.limpar = () => {
    try {
      rmdirSync(path.join(pista, 'node_modules'));
    } catch {}
    rmSync(T, { recursive: true, force: true });
  };
  return t;
};

// 8.3 e ponto no fim so existem em volume NTFS com nomes curtos; devolve o motivo do pulo, ou null
export const motivoPuloWindows = (t) => {
  if (process.platform !== 'win32') return 'so no Windows';
  if (!existsSync(path.join(t.pista, 'PACKAG~1'))) return 'volume sem nomes 8.3';
  return null;
};
