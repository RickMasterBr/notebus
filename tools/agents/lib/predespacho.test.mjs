import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adquirir } from './trava.mjs';
import { conferir, formatar, veredito } from './predespacho.mjs';

const SCHEMA = fileURLToPath(new URL('./fixtures/contrato.schema.json', import.meta.url));
const AGORA = 1000;

const git = (repo, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', repo, ...args], { encoding: 'utf8' }).trim();

// repo temporario com a branch main, raiz com o gate vigente e o contrato padrao; nada fora do tmp
const ambiente = ({ arquivos = { 'tools/x.mjs': 'export const x = 1;\n', 'tools/x.test.mjs': "import { readFileSync } from 'node:fs';\nreadFileSync('tools/x.mjs');\n" } } = {}) => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'predesp-'));
  const repo = path.join(tmp, 'repo');
  const raiz = path.join(tmp, 'raiz');
  mkdirSync(repo);
  mkdirSync(path.join(raiz, '_gate-bin', 'abc1234', 'tools', 'agents'), { recursive: true });
  writeFileSync(path.join(raiz, '_gate-bin', 'VIGENTE.txt'), 'abc1234\n');
  writeFileSync(path.join(raiz, '_gate-bin', 'abc1234', 'tools', 'agents', 'gate.mjs'), '');
  git(repo, 'init', '-q', '-b', 'main');
  for (const [nome, texto] of Object.entries(arquivos)) {
    mkdirSync(path.dirname(path.join(repo, nome)), { recursive: true });
    writeFileSync(path.join(repo, nome), texto);
  }
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  const arquivo = path.join(tmp, 'tarefa-x.md');
  return { tmp, repo, raiz, base, arquivo };
};

const SECAO10 = '\n## 10. Formato de entrega\nCopie o criterio palavra por palavra.\n\n## 11. Criterios\n';

const escreve = (amb, mudar = {}, secao10 = SECAO10) => {
  const cab = {
    id: 'tarefa-x', modo: 'agente normal', executor: { harness: 'claude', modelo: 'sonnet' }, base: { branch: 'main', commit: amb.base },
    pista: 'pista-x', arquivos_permitidos: ['tools/y.mjs'], comandos_validacao: ['node --test tools/y.test.mjs'],
    limites: { turnos: 20, minutos: 20 }, criterios: ['C1 um'], ...mudar,
  };
  for (const k of Object.keys(cab)) if (cab[k] === undefined) delete cab[k];
  writeFileSync(amb.arquivo, `# c\n\n\`\`\`json contrato\n${JSON.stringify(cab, null, 2)}\n\`\`\`\n${secao10}`);
};

const rodar = (amb, extra = {}) => conferir({ contrato: amb.arquivo, schemaPath: SCHEMA, raiz: amb.raiz, repo: amb.repo, agora: AGORA, processos: () => [], ...extra });
const nivel = (linhas, codigo) => linhas.filter((l) => l.codigo === codigo).map((l) => l.nivel);
const limpa = (amb) => rmSync(amb.tmp, { recursive: true, force: true });
const tudo = (dir) => readdirSync(dir, { recursive: true }).sort();

test('contrato bom: tudo OK, formato ASCII de uma linha e PRONTO', () => {
  const amb = ambiente();
  escreve(amb);
  const linhas = rodar(amb);
  assert.ok(linhas.every((l) => l.nivel === 'OK'), linhas.map(formatar).join('\n'));
  assert.deepEqual(veredito(linhas), { texto: 'PRONTO', codigo: 0 });
  for (const l of linhas) assert.match(formatar(l), /^(OK|FALTA|AVISO) [A-Z_]+ [\x20-\x7E]+$/);
  limpa(amb);
});

test('veredito: uma linha FALTA faz NAO PRONTO com codigo 1; AVISO sozinho nao', () => {
  assert.deepEqual(veredito([{ nivel: 'OK' }, { nivel: 'FALTA' }]), { texto: 'NAO PRONTO', codigo: 1 });
  assert.deepEqual(veredito([{ nivel: 'AVISO' }, { nivel: 'OK' }]), { texto: 'PRONTO', codigo: 0 });
});

test('BASE_VELHA: prefixo da base atual passa; commit antigo falha', () => {
  const amb = ambiente();
  escreve(amb, { base: { branch: 'main', commit: amb.base.slice(0, 7) } });
  assert.deepEqual(nivel(rodar(amb), 'BASE_VELHA'), ['OK']);
  writeFileSync(path.join(amb.repo, 'novo.txt'), 'n');
  git(amb.repo, 'add', 'novo.txt');
  git(amb.repo, 'commit', '-q', '-m', 'andou');
  assert.deepEqual(nivel(rodar(amb), 'BASE_VELHA'), ['FALTA']);
  escreve(amb, { base: { branch: 'main', commit: git(amb.repo, 'rev-parse', 'HEAD') } });
  assert.deepEqual(nivel(rodar(amb), 'BASE_VELHA'), ['OK']);
  limpa(amb);
});

test('CONTRATO_INVALIDO e SEM_PISTA_NO_CABECALHO', () => {
  const amb = ambiente();
  escreve(amb, { criterios: undefined });
  assert.deepEqual(nivel(rodar(amb), 'CONTRATO_INVALIDO'), ['FALTA']);
  assert.deepEqual(nivel(rodar(amb), 'SEM_PISTA_NO_CABECALHO'), ['OK']);
  escreve(amb, { pista: undefined });
  const linhas = rodar(amb);
  assert.deepEqual(nivel(linhas, 'SEM_PISTA_NO_CABECALHO'), ['FALTA']);
  assert.deepEqual(nivel(linhas, 'CONTRATO_INVALIDO'), ['FALTA']);
  writeFileSync(amb.arquivo, 'sem cabecalho\n');
  assert.deepEqual(rodar(amb).map((l) => `${l.nivel} ${l.codigo}`), ['FALTA CONTRATO_INVALIDO']);
  limpa(amb);
});

test('SUITE_INTEIRA: ** e a pasta inteira falham; com manual vira AVISO; arquivo exato passa', () => {
  const amb = ambiente();
  for (const cmd of ['node --test tools/agents/**/*.test.mjs', 'node --test tools/agents', 'node --test tools\\agents\\']) {
    escreve(amb, { comandos_validacao: [cmd] });
    assert.deepEqual(nivel(rodar(amb), 'SUITE_INTEIRA'), ['FALTA'], cmd);
    assert.deepEqual(nivel(rodar(amb, { manual: true }), 'SUITE_INTEIRA'), ['AVISO'], cmd);
  }
  escreve(amb, { comandos_validacao: ['node --test tools/agents/lib/a.test.mjs', 'git status --short'] });
  assert.deepEqual(nivel(rodar(amb), 'SUITE_INTEIRA'), ['OK']);
  limpa(amb);
});

test('TRAVA_CHEIA: 1 ativo passa, 2 falham; GATE_OCUPADO e so AVISO', () => {
  const amb = ambiente();
  escreve(amb);
  adquirir({ raiz: amb.raiz, id: 'a', minutos: 5, max: 2, agora: AGORA });
  assert.deepEqual(nivel(rodar(amb), 'TRAVA_CHEIA'), ['OK']);
  adquirir({ raiz: amb.raiz, id: 'b', minutos: 5, max: 2, agora: AGORA });
  const linhas = rodar(amb);
  assert.deepEqual(nivel(linhas, 'TRAVA_CHEIA'), ['FALTA']);
  assert.deepEqual(nivel(linhas, 'GATE_OCUPADO'), ['OK']);
  adquirir({ raiz: amb.raiz, id: 'g', minutos: 5, max: 1, agora: AGORA, pasta: '_trava-gate' });
  assert.deepEqual(nivel(rodar(amb), 'GATE_OCUPADO'), ['AVISO']);
  limpa(amb);
});

test('TRAVA_CHEIA nao conta a trava vencida e nao a apaga', () => {
  const amb = ambiente();
  escreve(amb);
  adquirir({ raiz: amb.raiz, id: 'a', minutos: 1, max: 2, agora: 0 });
  adquirir({ raiz: amb.raiz, id: 'b', minutos: 1, max: 2, agora: 0 });
  assert.deepEqual(nivel(rodar(amb, { agora: 10 * 60000 }), 'TRAVA_CHEIA'), ['OK']);
  assert.deepEqual(readdirSync(path.join(amb.raiz, '_despacho', '_trava')).sort(), ['a.lock', 'b.lock']);
  limpa(amb);
});

test('PISTA_ANTIGA: pasta existente ou branch tarefa/<id>', () => {
  const amb = ambiente();
  escreve(amb);
  mkdirSync(path.join(amb.raiz, 'pistas', 'pista-x'), { recursive: true });
  assert.deepEqual(nivel(rodar(amb), 'PISTA_ANTIGA'), ['FALTA']);
  rmSync(path.join(amb.raiz, 'pistas'), { recursive: true });
  assert.deepEqual(nivel(rodar(amb), 'PISTA_ANTIGA'), ['OK']);
  git(amb.repo, 'branch', 'tarefa/tarefa-x');
  assert.deepEqual(nivel(rodar(amb), 'PISTA_ANTIGA'), ['FALTA']);
  limpa(amb);
});

test('GATE_VIGENTE_AUSENTE: sem VIGENTE.txt, sem a copia, ou commit torto', () => {
  const amb = ambiente();
  escreve(amb);
  const vig = path.join(amb.raiz, '_gate-bin', 'VIGENTE.txt');
  writeFileSync(vig, 'ffff999\n');
  assert.deepEqual(nivel(rodar(amb), 'GATE_VIGENTE_AUSENTE'), ['FALTA']);
  writeFileSync(vig, 'lixo\n');
  assert.deepEqual(nivel(rodar(amb), 'GATE_VIGENTE_AUSENTE'), ['FALTA']);
  rmSync(vig);
  assert.deepEqual(nivel(rodar(amb), 'GATE_VIGENTE_AUSENTE'), ['FALTA']);
  writeFileSync(vig, 'abc1234\n');
  assert.deepEqual(nivel(rodar(amb), 'GATE_VIGENTE_AUSENTE'), ['OK']);
  limpa(amb);
});

test('JA_DESPACHADO: so AVISO quando _despacho/<id> existe', () => {
  const amb = ambiente();
  escreve(amb);
  assert.deepEqual(nivel(rodar(amb), 'JA_DESPACHADO'), ['OK']);
  mkdirSync(path.join(amb.raiz, '_despacho', 'tarefa-x'), { recursive: true });
  const linhas = rodar(amb);
  assert.deepEqual(nivel(linhas, 'JA_DESPACHADO'), ['AVISO']);
  assert.deepEqual(veredito(linhas).codigo, 0);
  limpa(amb);
});

test('LE_O_TEXTO: teste de fora que le o arquivo permitido avisa; teste na lista ou sem readFileSync nao', () => {
  const amb = ambiente({ arquivos: {
    'tools/x.mjs': 'export const x = 1;\n',
    'tools/x.test.mjs': "import { readFileSync } from 'node:fs';\nreadFileSync('tools/x.mjs');\n",
    'tools/z.test.mjs': "import { x } from './x.mjs';\n",
  } });
  escreve(amb, { arquivos_permitidos: ['tools/x.mjs'] });
  let linhas = rodar(amb).filter((l) => l.codigo === 'LE_O_TEXTO');
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].nivel, 'AVISO');
  assert.match(linhas[0].texto, /tools\/x\.test\.mjs.*tools\/x\.mjs/);
  assert.doesNotMatch(linhas[0].texto, /z\.test/);
  escreve(amb, { arquivos_permitidos: ['tools/x.mjs', 'tools/x.test.mjs'] });
  linhas = rodar(amb).filter((l) => l.codigo === 'LE_O_TEXTO');
  assert.deepEqual(linhas.map((l) => l.nivel), ['OK']);
  limpa(amb);
});

test('LE_O_TEXTO_SEM_COMANDO: teste que le o texto e nao esta nos comandos da FALTA; citado da OK; manual vira AVISO', () => {
  const amb = ambiente({ arquivos: {
    'tools/x.mjs': 'export const x = 1;\n',
    'tools/x.test.mjs': "import { readFileSync } from 'node:fs';\nreadFileSync('tools/x.mjs');\n",
    'tools/w.test.mjs': "import { readFileSync } from 'node:fs';\nreadFileSync('tools/x.mjs');\n",
  } });
  escreve(amb, { arquivos_permitidos: ['tools/x.mjs'], comandos_validacao: ['node --test tools\\x.test.mjs'] });
  const linhas = rodar(amb).filter((l) => l.codigo === 'LE_O_TEXTO_SEM_COMANDO');
  assert.deepEqual(linhas.map((l) => l.nivel), ['FALTA']);
  assert.match(linhas[0].texto, /tools\/w\.test\.mjs/);
  assert.doesNotMatch(linhas[0].texto, /x\.test/);
  assert.deepEqual(nivel(rodar(amb, { manual: true }), 'LE_O_TEXTO_SEM_COMANDO'), ['AVISO']);
  escreve(amb, { arquivos_permitidos: ['tools/x.mjs'], comandos_validacao: ['node --test tools/x.test.mjs', 'node --test w.test.mjs'] });
  assert.deepEqual(nivel(rodar(amb), 'LE_O_TEXTO_SEM_COMANDO'), ['OK']);
  limpa(amb);
});

test('LE_O_TEXTO_SEM_COMANDO: lista ate 5 testes e diz e mais N; sem achado da OK', () => {
  const leitor = "import { readFileSync } from 'node:fs';\nreadFileSync('tools/x.mjs');\n";
  const arquivos = { 'tools/x.mjs': 'export const x = 1;\n' };
  for (let i = 1; i <= 7; i++) arquivos[`tools/t${i}.test.mjs`] = leitor;
  const amb = ambiente({ arquivos });
  escreve(amb, { arquivos_permitidos: ['tools/x.mjs'] });
  const linhas = rodar(amb).filter((l) => l.codigo === 'LE_O_TEXTO_SEM_COMANDO');
  assert.equal(linhas.length, 1);
  assert.equal((linhas[0].texto.match(/\.test\.mjs/g) ?? []).length, 5);
  assert.match(linhas[0].texto, /e mais 2$/);
  limpa(amb);
  const vazio = ambiente();
  escreve(vazio, { arquivos_permitidos: ['tools/outro.mjs'] });
  assert.deepEqual(nivel(rodar(vazio), 'LE_O_TEXTO_SEM_COMANDO'), ['OK']);
  limpa(vazio);
});

test('SEM_FRASE_CRITERIOS: sem secao ou sem a expressao FALTA; com a expressao (qualquer caixa) OK; manual vira AVISO', () => {
  const amb = ambiente();
  escreve(amb, {}, '');
  assert.deepEqual(nivel(rodar(amb), 'SEM_FRASE_CRITERIOS'), ['FALTA']);
  assert.deepEqual(nivel(rodar(amb, { manual: true }), 'SEM_FRASE_CRITERIOS'), ['AVISO']);
  escreve(amb, {}, '\n## 10. Formato\nResuma os criterios.\n\n## 11. Criterios\nPALAVRA POR PALAVRA fora da secao.\n');
  assert.deepEqual(nivel(rodar(amb), 'SEM_FRASE_CRITERIOS'), ['FALTA']);
  escreve(amb, {}, '\n## 10. Formato\nCopie PALAVRA POR PALAVRA.\n\n## 11. Criterios\n');
  assert.deepEqual(nivel(rodar(amb), 'SEM_FRASE_CRITERIOS'), ['OK']);
  limpa(amb);
});

test('EDITOR_ABERTO: code, Code.exe e CODE.EXE avisam; Codex.exe, node.exe e funcao que lanca dao OK; nunca FALTA', () => {
  const amb = ambiente();
  escreve(amb);
  for (const nome of ['Code.exe', 'code', 'CODE.EXE']) {
    const linhas = rodar(amb, { processos: () => ['node.exe', nome] });
    assert.deepEqual(nivel(linhas, 'EDITOR_ABERTO'), ['AVISO'], nome);
    assert.match(formatar(linhas.find((l) => l.codigo === 'EDITOR_ABERTO')), /^AVISO EDITOR_ABERTO feche o VS Code antes do rodar \(A16\)$/);
    assert.equal(veredito(linhas).codigo, 0);
  }
  assert.deepEqual(nivel(rodar(amb, { processos: () => ['Codex.exe', 'node.exe'] }), 'EDITOR_ABERTO'), ['OK']);
  assert.deepEqual(nivel(rodar(amb, { processos: () => { throw new Error('x'); } }), 'EDITOR_ABERTO'), ['OK']);
  limpa(amb);
});

test('so le: nada muda na raiz nem no repositorio, mesmo com FALTA', () => {
  const amb = ambiente();
  escreve(amb, { comandos_validacao: ['node --test tools/agents'] });
  adquirir({ raiz: amb.raiz, id: 'a', minutos: 1, max: 2, agora: 0 });
  const antesRaiz = tudo(amb.raiz);
  const antesRepo = git(amb.repo, 'status', '--porcelain');
  const antesRefs = git(amb.repo, 'for-each-ref');
  rodar(amb, { agora: 10 * 60000 });
  assert.deepEqual(tudo(amb.raiz), antesRaiz);
  assert.equal(git(amb.repo, 'status', '--porcelain'), antesRepo);
  assert.equal(git(amb.repo, 'for-each-ref'), antesRefs);
  limpa(amb);
});
