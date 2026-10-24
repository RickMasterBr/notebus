import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const MERGE = aqui('./merge.mjs');
const SCHEMAS = aqui('./lib/fixtures');
const ID = 'tarefa-x';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tenta = (cwd, ...args) => {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
};

// repo na branch integ; pista com a branch tarefa/tarefa-x (1 commit) e 1 symlink para um node_modules falso fora do repo
const ambiente = () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'merge-'));
  const repo = path.join(tmp, 'repo');
  const raiz = path.join(tmp, 'raiz');
  mkdirSync(repo);
  mkdirSync(raiz);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'config', 'user.email', 't@t');
  writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
  writeFileSync(path.join(repo, 'README.md'), 'x\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', '--short', 'HEAD');
  git(repo, 'checkout', '-q', '-b', 'integ');
  const pista = path.join(raiz, 'pistas', 'pista-x');
  git(repo, 'worktree', 'add', '-q', pista, '-b', `tarefa/${ID}`, base);
  writeFileSync(path.join(pista, 'feito.txt'), 'feito\n');
  git(pista, 'add', 'feito.txt');
  git(pista, 'commit', '-q', '-m', 'tarefa');
  mkdirSync(path.join(pista, '.agent'));
  writeFileSync(path.join(pista, '.agent', 'contrato.md'), 'c\n');
  const alvo = path.join(tmp, 'nm-falso');
  mkdirSync(alvo);
  writeFileSync(path.join(alvo, 'pacote.txt'), 'conteudo');
  symlinkSync(alvo, path.join(pista, 'node_modules'), 'junction');

  const cab = {
    id: ID, modo: 'agente normal', executor: { harness: 'claude', modelo: 'm' }, base: { branch: 'main', commit: base }, pista: 'pista-x',
    arquivos_permitidos: ['feito.txt'], areas_autorizadas: ['area/'], comandos_validacao: ['node --test'],
    limites: { turnos: 5, minutos: 5 }, criterios: ['C1 um'],
  };
  const contrato = path.join(tmp, `${ID}.md`);
  writeFileSync(contrato, `# c\n\n\`\`\`json contrato\n${JSON.stringify(cab, null, 2)}\n\`\`\`\n`);
  const despacho = path.join(raiz, '_despacho', ID);
  mkdirSync(despacho, { recursive: true });
  const amb = { tmp, repo, raiz, pista, alvo, contrato, despacho, gatePath: path.join(despacho, 'gate.json') };
  // gate.json aprovado do commit atual da branch e do contrato atual; `extra` sobrescreve campos
  amb.gate = (extra) => {
    const gate = {
      versao: 1, resultado: 'aprovado', exige_revisor: false,
      head: git(repo, 'rev-parse', `tarefa/${ID}`),
      contrato_sha256: createHash('sha256').update(readFileSync(contrato)).digest('hex'),
      ...extra,
    };
    writeFileSync(amb.gatePath, JSON.stringify(gate));
  };
  amb.gate({});
  return amb;
};

const limpa = (amb) => rmSync(amb.tmp, { recursive: true, force: true });
const rodar = (amb, extra = [], { destino = 'integ', arquivo = amb.contrato, env } = {}) => {
  const args = [MERGE, arquivo, '--raiz', amb.raiz, '--repo', amb.repo, '--schemas', SCHEMAS, ...(destino ? ['--destino', destino] : []), ...extra];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 60000, ...(env && { env }) });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout };
};

// retrato do que a recusa nao pode mexer
const estado = (amb) => ({
  destino: tenta(amb.repo, 'rev-parse', 'integ'),
  branch: tenta(amb.repo, 'rev-parse', `tarefa/${ID}`),
  worktrees: git(amb.repo, 'worktree', 'list'),
  pista: existsSync(amb.pista),
  juncao: lstatSync(path.join(amb.pista, 'node_modules'), { throwIfNoEntry: false })?.isSymbolicLink() ?? false,
  raiz: readdirSync(amb.raiz, { recursive: true }).sort(),
});

const recusa = (amb, codigo, extra = [], opcoes) => {
  const antes = estado(amb);
  const r = rodar(amb, ['--confirmo', ...extra], opcoes);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, new RegExp(`FALHA ${codigo}\\b`), r.out);
  assert.deepEqual(estado(amb), antes);
};

const suite = (nome, corpo) =>
  test(nome, () => {
    const amb = ambiente();
    try {
      corpo(amb);
    } finally {
      limpa(amb);
    }
  });

suite('M1 uso errado: codigo 2 e nada alterado', (amb) => {
  const antes = estado(amb);
  const casos = [
    [[], { arquivo: null, destino: null }],
    [[], { destino: null }],
    [[], { arquivo: path.join(amb.tmp, 'nao-existe.md') }],
    [['--flag-estranha'], {}],
    [['--mensagem'], {}],
  ];
  for (const [extra, opcoes] of casos) {
    const args = opcoes.arquivo === null ? [MERGE] : null;
    const r = args ? spawnSync(process.execPath, args, { encoding: 'utf8' }) : { status: rodar(amb, extra, opcoes).code, stdout: '', stderr: '' };
    assert.equal(r.status, 2, JSON.stringify(opcoes));
  }
  assert.match(rodar(amb, [], { destino: null }).out, /FALHA USO .*--destino/);
  assert.deepEqual(estado(amb), antes);
});

suite('M2 SEM_GATE: sem arquivo e com versao 2', (amb) => {
  amb.gate({ versao: 2 });
  recusa(amb, 'SEM_GATE');
  rmSync(amb.gatePath);
  recusa(amb, 'SEM_GATE');
});

suite('M2 GATE_NAO_APROVOU: reprovado e inconclusivo', (amb) => {
  for (const resultado of ['reprovado', 'inconclusivo']) {
    amb.gate({ resultado });
    recusa(amb, 'GATE_NAO_APROVOU');
  }
});

suite('M2 GATE_DE_OUTRO_COMMIT: commit novo e prefixo de 7 caracteres', (amb) => {
  const aprovado = git(amb.repo, 'rev-parse', `tarefa/${ID}`);
  amb.gate({ head: aprovado.slice(0, 7) });
  recusa(amb, 'GATE_DE_OUTRO_COMMIT');
  amb.gate({});
  writeFileSync(path.join(amb.pista, 'mais.txt'), 'm\n');
  git(amb.pista, 'add', 'mais.txt');
  git(amb.pista, 'commit', '-q', '-m', 'depois do gate');
  recusa(amb, 'GATE_DE_OUTRO_COMMIT');
});

suite('M2 GATE_DE_OUTRO_CONTRATO: contrato mudou depois do gate', (amb) => {
  writeFileSync(amb.contrato, `${readFileSync(amb.contrato, 'utf8')}\nmais uma linha\n`);
  recusa(amb, 'GATE_DE_OUTRO_CONTRATO');
});

suite('M2 FALTA_REVISOR: recusa sem --revisado e passa com ele', (amb) => {
  amb.gate({ exige_revisor: true });
  recusa(amb, 'FALTA_REVISOR');
  const r = rodar(amb, ['--revisado']);
  assert.equal(r.code, 0, r.out);
});

suite('A3 FALTA_REVISOR: exige_revisor que nao e o booleano false recusa; --revisado e false passam', (amb) => {
  for (const exige of ['true', 'false', null, 1, 'sim', undefined]) {
    amb.gate({ exige_revisor: exige });
    recusa(amb, 'FALTA_REVISOR');
  }
  const semCampo = JSON.parse(readFileSync(amb.gatePath, 'utf8'));
  delete semCampo.exige_revisor;
  writeFileSync(amb.gatePath, JSON.stringify(semCampo));
  recusa(amb, 'FALTA_REVISOR');
  // false booleano passa sem a flag
  amb.gate({ exige_revisor: false });
  const livre = rodar(amb, ['--confirmo']);
  assert.equal(livre.code, 0, livre.out);
});

suite('A3 FALTA_REVISOR: --revisado libera gate sem o campo', (amb) => {
  const semCampo = JSON.parse(readFileSync(amb.gatePath, 'utf8'));
  delete semCampo.exige_revisor;
  writeFileSync(amb.gatePath, JSON.stringify(semCampo));
  const r = rodar(amb, ['--confirmo', '--revisado']);
  assert.equal(r.code, 0, r.out);
});

suite('M2 REPO_SUJO: arquivo nao rastreado no repo', (amb) => {
  writeFileSync(path.join(amb.repo, 'sujeira.txt'), 's\n');
  recusa(amb, 'REPO_SUJO');
});

suite('M2 DESTINO_PROIBIDO: main, inexistente e a propria branch', (amb) => {
  recusa(amb, 'DESTINO_PROIBIDO', [], { destino: 'main' });
  recusa(amb, 'DESTINO_PROIBIDO', [], { destino: 'nao-existe' });
  recusa(amb, 'DESTINO_PROIBIDO', [], { destino: `tarefa/${ID}` });
});

suite('M2 BRANCH_NAO_EXISTE: gate aprovado mas sem a branch', (amb) => {
  git(amb.repo, 'worktree', 'remove', '--force', amb.pista);
  git(amb.repo, 'branch', '-D', `tarefa/${ID}`);
  recusa(amb, 'BRANCH_NAO_EXISTE');
});

suite('M2 DESTINO_NAO_ATUAL: o repo esta em outra branch', (amb) => {
  git(amb.repo, 'checkout', '-q', 'main');
  recusa(amb, 'DESTINO_NAO_ATUAL');
});

suite('M3 sem --confirmo: mostra o plano e nao muda nada', (amb) => {
  const antes = estado(amb);
  const r = rodar(amb);
  assert.equal(r.code, 0, r.out);
  const { plano } = JSON.parse(r.stdout.slice(0, r.stdout.lastIndexOf('}') + 1));
  assert.equal(plano.id, ID);
  assert.equal(plano.destino, 'integ');
  assert.equal(plano.branch, `tarefa/${ID}`);
  assert.equal(plano.head, antes.branch);
  assert.deepEqual(plano.junctions, [path.join(amb.pista, 'node_modules')]);
  assert.deepEqual(estado(amb), antes);
  assert.equal(antes.pista && antes.juncao, true);
});

suite('M4 merge sem fast-forward, hook nao roda, merge.json gravado', (amb) => {
  const marca = path.join(amb.tmp, 'hook-rodou');
  writeFileSync(path.join(amb.repo, '.git', 'hooks', 'post-merge'), `#!/bin/sh\ntouch "${marca.replace(/\\/g, '/')}"\n`, { mode: 0o755 });
  const antes = git(amb.repo, 'rev-parse', 'integ');
  const ramo = git(amb.repo, 'rev-parse', `tarefa/${ID}`);
  const r = rodar(amb, ['--confirmo']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`OK ${ID} mesclado em integ \\([0-9a-f]{7}\\)`));
  const topo = git(amb.repo, 'rev-parse', 'integ');
  assert.deepEqual(git(amb.repo, 'rev-list', '--parents', '-n', '1', topo).split(' ').slice(1), [antes, ramo]);
  assert.equal(git(amb.repo, 'log', '-1', '--format=%s'), `merge: ${ID}`);
  assert.equal(readFileSync(path.join(amb.repo, 'feito.txt'), 'utf8').trim(), 'feito');
  assert.equal(existsSync(marca), false);
  const m = JSON.parse(readFileSync(path.join(amb.despacho, 'merge.json'), 'utf8'));
  assert.equal(m.id, ID);
  assert.equal(m.destino, 'integ');
  assert.equal(m.commit_merge, topo);
  assert.ok(m.inicio && m.fim);
});

suite('M4 --mensagem troca a mensagem do commit de merge', (amb) => {
  const r = rodar(amb, ['--confirmo', '--mensagem', 'junta a tarefa']);
  assert.equal(r.code, 0, r.out);
  assert.equal(git(amb.repo, 'log', '-1', '--format=%s'), 'junta a tarefa');
});

suite('M5 conflito: aborta, destino igual, pista e branch intactas', (amb) => {
  writeFileSync(path.join(amb.pista, 'README.md'), 'da tarefa\n');
  git(amb.pista, 'commit', '-q', '-am', 'tarefa mexe no README');
  amb.gate({});
  writeFileSync(path.join(amb.repo, 'README.md'), 'do destino\n');
  git(amb.repo, 'commit', '-q', '-am', 'destino mexe no README');
  const antes = estado(amb);
  const r = rodar(amb, ['--confirmo']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FALHA CONFLITO/);
  assert.equal(tenta(amb.repo, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'), null);
  assert.equal(git(amb.repo, 'status', '--porcelain'), '');
  assert.deepEqual(estado(amb), antes);
});

suite('A4 git sem identidade: MERGE_FALHOU (nao CONFLITO), tudo intacto', (amb) => {
  git(amb.repo, 'config', '--unset', 'user.name');
  git(amb.repo, 'config', '--unset', 'user.email');
  const casa = path.join(amb.tmp, 'casa');
  mkdirSync(casa);
  const vazio = path.join(casa, 'gitconfig-vazio');
  writeFileSync(vazio, '');
  const env = {
    ...process.env,
    HOME: casa, USERPROFILE: casa, XDG_CONFIG_HOME: casa,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: vazio,
    // sem isto o git tenta adivinhar nome e e-mail pelo usuario e pelo host
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.useConfigOnly', GIT_CONFIG_VALUE_0: 'true',
    EMAIL: '', GIT_AUTHOR_NAME: '', GIT_AUTHOR_EMAIL: '', GIT_COMMITTER_NAME: '', GIT_COMMITTER_EMAIL: '',
  };
  const antes = estado(amb);
  const r = rodar(amb, ['--confirmo'], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FALHA MERGE_FALHOU /);
  assert.doesNotMatch(r.out, /CONFLITO/);
  assert.equal(tenta(amb.repo, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'), null);
  assert.equal(git(amb.repo, 'status', '--porcelain'), '');
  assert.deepEqual(estado(amb), antes);
});

suite('M6 depois do merge: link removido, alvo vivo, pista e branch sumiram', (amb) => {
  const r = rodar(amb, ['--confirmo']);
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(path.join(amb.alvo, 'pacote.txt'), 'utf8'), 'conteudo');
  assert.equal(existsSync(amb.pista), false);
  assert.doesNotMatch(git(amb.repo, 'worktree', 'list'), /pista-x/);
  assert.equal(tenta(amb.repo, 'rev-parse', '--verify', '--quiet', `refs/heads/tarefa/${ID}`), null);
});

suite('M6 e M7 pista com arquivo nao rastreado: PISTA_SUJA, merge feito, branch mantida', (amb) => {
  writeFileSync(path.join(amb.pista, 'lixo.txt'), 'l\n');
  const ramo = git(amb.repo, 'rev-parse', `tarefa/${ID}`);
  const r = rodar(amb, ['--confirmo']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FALHA PISTA_SUJA/);
  assert.match(r.out, /falta limpar a pista e a branch a mao/);
  assert.equal(git(amb.repo, 'rev-parse', `tarefa/${ID}`), ramo);
  assert.equal(existsSync(amb.pista), true);
  git(amb.repo, 'merge-base', '--is-ancestor', ramo, 'integ');
  assert.equal(readFileSync(path.join(amb.alvo, 'pacote.txt'), 'utf8'), 'conteudo');
});

suite('M7 conflito nunca apaga a branch', (amb) => {
  writeFileSync(path.join(amb.pista, 'README.md'), 'da tarefa\n');
  git(amb.pista, 'commit', '-q', '-am', 'tarefa');
  amb.gate({});
  writeFileSync(path.join(amb.repo, 'README.md'), 'do destino\n');
  git(amb.repo, 'commit', '-q', '-am', 'destino');
  rodar(amb, ['--confirmo']);
  assert.notEqual(tenta(amb.repo, 'rev-parse', '--verify', '--quiet', `refs/heads/tarefa/${ID}`), null);
});

// o -d so apaga ramo mergeado, mas depois de um merge feito o -D se comportaria igual: so a leitura do codigo pega a troca
test('M7 o codigo apaga a branch so com -d minusculo e nunca com -D', () => {
  const fonte = readFileSync(MERGE, 'utf8');
  assert.match(fonte, /'branch', '-d'/);
  assert.doesNotMatch(fonte, /'-D'|--force|'-f'/);
});
