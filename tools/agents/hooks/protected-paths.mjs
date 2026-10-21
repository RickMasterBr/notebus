import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE_ARGS = ['file_path', 'notebook_path', 'path', 'TargetFile', 'AbsolutePath'];
// nunca liberados por autorizacao; 'autorizacao.json' vale em qualquer pasta
const CONTROLE = ['.claude/settings.json', '.claude/settings.local.json', '.agents/hooks.json', 'opencode.json', 'autorizacao.json', 'tools/agents/hooks/'];
const LEITURA = ['git diff', 'git log', 'git show', 'git status', 'get-content', 'cat', 'type', 'ls', 'dir', 'get-childitem', 'select-string', 'grep', 'rg', 'npx vitest', 'npx tsc'];

const norm = (p) => p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
const stripSlash = (s) => s.replace(/\/$/, '');
const isUnder = (rel, entry) => rel === stripSlash(entry) || rel.startsWith(stripSlash(entry) + '/');
const isControle = (rel) => CONTROLE.some((c) => (c === 'autorizacao.json' ? rel.split('/').pop() === c : isUnder(rel, c)));

// raiz da pista = primeiro ancestral com .git (arquivo na worktree, pasta na principal)
const findRoot = (dir) => {
  let d = path.resolve(dir);
  for (;;) {
    if (existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) throw new Error('raiz do repositorio nao encontrada a partir de ' + dir);
    d = up;
  }
};

// null = fora da pista (a lista nao cobre)
const relToRoot = (p, root, cwd) => {
  const rel = norm(path.relative(root, path.isAbsolute(p) ? p : path.resolve(cwd, p)));
  return rel.startsWith('..') ? null : rel;
};

export const MOTIVO = (c) =>
  `Area protegida: ${c}. Esta tarefa nao tem autorizacao escrita. Pare e relate no campo duvidas; nao tente outro caminho.`;

// ausente, ilegivel ou quebrado = nenhuma autorizacao
const lerAutorizacao = (file) => {
  try {
    return (JSON.parse(readFileSync(file, 'utf8')).permitido ?? []).map(norm);
  } catch {
    return [];
  }
};

const TSC_PROIBIDO = ['-b', '--build', '--incremental', '--tsbuildinfofile', '--outdir', '--outfile', '--declarationdir', '--emitdeclarationonly'];
const flagEm = (tokens, lista) => tokens.some((t) => lista.some((f) => t === f || t.startsWith(f + '=')));
const eLeitura = (seg) => {
  const s = seg.trim().toLowerCase();
  const cmd = LEITURA.find((c) => s === c || s.startsWith(c + ' ') || s.startsWith(c + '\t'));
  if (!cmd) return false;
  const tokens = s.split(/\s+/);
  if (cmd === 'npx vitest') return !flagEm(tokens, ['-u', '--update', '--outputfile', '--output-file']);
  if (cmd === 'npx tsc') return tokens.includes('--noemit') && !flagEm(tokens, TSC_PROIBIDO);
  return true;
};
// R3: redirecionamentos que nao escrevem em arquivo
const semInofensivos = (c) => c.replace(/\d*>&\d+/g, '').replace(/\d*>>?\s*(\$null|nul|\/dev\/null)\b/gi, '');

// R4: o token (relativo a base) casa com a entrada nas primeiras min(partes) partes
const globParte = (g, parte) =>
  new RegExp('^' + g.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(parte);
const globCasa = (rel, entry) => {
  const a = rel.split('/').filter(Boolean);
  const b = entry.split('/');
  return Array.from({ length: Math.min(a.length, b.length) }, (_, i) => globParte(a[i], b[i])).every(Boolean);
};
// R5: tokens do segmento sem aspas; flag so vale pelo valor depois de = ou :
const tokensDe = (seg) =>
  seg
    .trim()
    .split(/\s+/)
    .map((t) => {
      const i = t.startsWith('-') ? t.search(/[=:]/) : -1;
      if (t.startsWith('-') && i < 0) return '';
      return t.slice(i + 1).replace(/^['"]+|['"]+$/g, '').replace(/,$/, '');
    })
    .filter(Boolean);

// R6: caminho relativo a raiz, com . e .. colapsados; null = fora da pista (ignorar o token)
const resolverToken = (tok, cwdRel, rootN) => {
  const t = norm(tok);
  let base;
  if (/^[a-z]:\//.test(t) || t.startsWith('/')) {
    if (t !== rootN && !t.startsWith(rootN + '/')) return null;
    base = t.slice(rootN.length);
  } else if (cwdRel === null) return null;
  else base = cwdRel + '/' + t;
  const partes = [];
  for (const p of base.split('/')) {
    if (p === '..') {
      if (!partes.length) return null;
      partes.pop();
    } else if (p && p !== '.') partes.push(p);
  }
  return partes.join('/');
};

// R7: primeira entrada que o caminho resolvido cita (literal: isUnder; curinga: globCasa)
const citaResolvido = (seg, cwdRel, rootN, alvos) => {
  for (const tok of tokensDe(seg)) {
    const rel = resolverToken(tok, cwdRel, rootN);
    if (rel === null) continue;
    const hit = alvos.find((e) => (/[*?[]/.test(rel) ? globCasa(rel, e) : isUnder(rel, e)));
    if (hit) return hit;
  }
};
const escreve = (seg) => seg.includes('>') || /\btee\b/i.test(seg) || seg.includes('--output');

// devolve { negar, motivo, alvo }; qualquer excecao sobe para o chamador, que nega
export const decidir = (input, { areas = path.join(HERE, 'protected-paths.json'), autorizacao } = {}) => {
  const call = input.toolCall ?? { name: input.tool_name, args: input.tool_input };
  const args = call.args ?? {};
  const cwd = input.cwd ?? args.Cwd ?? input.workspacePaths?.[0];
  if (!cwd) throw new Error('entrada sem cwd');
  const root = findRoot(input.workspacePaths?.[0] ?? cwd);
  const lista = JSON.parse(readFileSync(areas, 'utf8')).map(norm);
  const permitido = autorizacao ? lerAutorizacao(autorizacao) : [];
  const liberado = (rel) => permitido.some((a) => isUnder(rel, a));
  const protegido = (rel) => (isControle(rel) ? rel : lista.find((e) => isUnder(rel, e) && !liberado(rel)));
  const negar = (alvo) => ({ negar: true, motivo: MOTIVO(alvo), alvo });

  const command = args.command ?? args.CommandLine;
  if (typeof command === 'string') {
    const cwdRel = relToRoot(args.Cwd ?? cwd, root, root);
    const emCwd = cwdRel === null ? undefined : lista.find((e) => isUnder(cwdRel, e) && !liberado(cwdRel));
    const rootN = norm(root);
    const alvos = [...lista.map(stripSlash).filter((e) => !liberado(e)), ...CONTROLE.filter((c) => c !== 'autorizacao.json').map(stripSlash)];
    for (const seg of semInofensivos(command).split(/;|&&|\|\||\||&|\r?\n/)) {
      if (!seg.trim()) continue;
      const texto = norm(seg);
      // R5-R7 (resolucao) em OU com a checagem por texto, que fica como segunda rede
      const citado =
        citaResolvido(seg, cwdRel, rootN, alvos) ??
        CONTROLE.find((c) => texto.includes(c)) ??
        lista.find((e) => texto.includes(stripSlash(e)) && !liberado(stripSlash(e)));
      if (citado ? !eLeitura(seg) || escreve(seg) : emCwd && !eLeitura(seg)) return negar(citado ?? emCwd);
    }
    return { negar: false, alvo: command };
  }
  for (const k of FILE_ARGS) {
    if (typeof args[k] !== 'string') continue;
    const rel = relToRoot(args[k], root, cwd);
    const alvo = rel === null ? undefined : protegido(rel);
    if (alvo) return negar(rel);
  }
  return { negar: false, alvo: FILE_ARGS.map((k) => args[k]).find((v) => typeof v === 'string') };
};

export const resposta = (harness, r) => {
  if (harness === 'agy') return JSON.stringify(r.negar ? { decision: 'deny', reason: r.motivo } : { decision: 'allow' });
  if (!r.negar) return '';
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: r.motivo },
  });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [harness, ...rest] = process.argv.slice(2);
  const opt = (nome) => rest[rest.indexOf(nome) + 1] && rest.includes(nome) ? rest[rest.indexOf(nome) + 1] : undefined;
  let r;
  let tool;
  try {
    let raw = '';
    for await (const c of process.stdin) raw += c;
    const input = JSON.parse(raw);
    tool = input.toolCall?.name ?? input.tool_name;
    r = decidir(input, { areas: opt('--areas'), autorizacao: opt('--autorizacao') });
  } catch (e) {
    r = { negar: true, motivo: `Hook de area protegida falhou (${e.message}); negado por seguranca. Pare e relate no campo duvidas.` };
  }
  const log = opt('--log');
  if (log) {
    try {
      appendFileSync(log, JSON.stringify({ t: new Date().toISOString(), harness, tool, alvo: r.alvo, decisao: r.negar ? 'negar' : 'permitir' }) + '\n');
    } catch {}
  }
  process.stdout.write(resposta(harness, r));
}
