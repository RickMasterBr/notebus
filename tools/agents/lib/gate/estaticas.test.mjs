import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, rmdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { g00, g01, g02, g03, g04, g05, g06, g07, g08, g11, g13, g14, g15 } from './estaticas.mjs';
import { BRANCH, criarRepo } from '../gate-fixtures/repo-temporario.mjs';

const falhas = (itens) => itens.filter((i) => i.status === 'falha').map((i) => i.codigo).sort();
const avisos = (itens) => itens.filter((i) => i.status === 'aviso').map((i) => i.codigo).sort();
const com = (itens, codigo) => itens.find((i) => i.codigo === codigo);
// repositorio pronto (um commit dentro da lista), com sobreposicao no cabecalho
const novo = (cab = {}, modo = 'manual') => {
  const t = criarRepo({ modo, contrato: cab });
  t.pronto();
  return t;
};
const tudo = (t, fn, extra) => fn(t.ctx(extra));

test('C2 G00: gate dentro da pista falha, fora passa', () => {
  const t = novo();
  assert.deepEqual(falhas(g00({ pista: t.pista, gateDir: path.join(t.pista, 'x', 'agents'), gatePath: 'g' })), ['GATE_DENTRO_DA_PISTA']);
  assert.deepEqual(g00({ pista: t.pista, gateDir: t.repo, gatePath: 'g' }), []);
  assert.deepEqual(g00(t.ctx()), []);
  t.limpar();
});

test('C2 G01: contrato alterado na pista, invalido, copia ausente e igual', () => {
  const t = novo();
  assert.deepEqual(tudo(t, g01), []);
  writeFileSync(path.join(t.pista, '.agent', 'contrato.md'), readFileSync(t.contratoPath, 'utf8') + 'a mais\n');
  assert.deepEqual(falhas(tudo(t, g01)), ['CONTRATO_ALTERADO']);
  t.gravarContrato(t.cabecalho, { copiar: false });
  assert.deepEqual([falhas(tudo(t, g01)), avisos(tudo(t, g01))], [[], ['SEM_COPIA_DO_CONTRATO']]);
  t.gravarContrato({ ...t.cabecalho, id: 'Maiusculas Invalidas' });
  assert.deepEqual(falhas(tudo(t, g01, ['--base', t.base])), ['CONTRATO_INVALIDO']);
  t.limpar();
});

test('C2 G01: despacho sem a copia do contrato e CONTRATO_ALTERADO', () => {
  const t = novo({}, 'despacho');
  rmSync(path.join(t.pista, '.agent', 'contrato.md'));
  assert.deepEqual(falhas(tudo(t, g01)), ['CONTRATO_ALTERADO']);
  t.limpar();
});

test('C2 G02: relatorio invalido, de outra tarefa, de outra branch, de outro commit', () => {
  const t = novo();
  assert.deepEqual(tudo(t, g02), []);
  t.gravarRelatorio({ resultado: 'talvez' });
  assert.deepEqual(falhas(tudo(t, g02)), ['RELATORIO_INVALIDO']);
  t.gravarRelatorio({ tarefa: 'outra' });
  assert.deepEqual(falhas(tudo(t, g02)), ['RELATORIO_DE_OUTRA_TAREFA']);
  t.gravarRelatorio({ branch: 'infra/x' });
  assert.deepEqual(falhas(tudo(t, g02)), ['RELATORIO_DE_OUTRA_TAREFA']);
  t.gravarRelatorio({ commit: t.base.slice(0, 7) });
  assert.deepEqual(falhas(tudo(t, g02)), ['RELATORIO_DE_OUTRO_COMMIT']);
  rmSync(t.relatorioPath);
  assert.deepEqual(falhas(tudo(t, g02)), ['RELATORIO_INVALIDO']);
  t.limpar();
});

test('C3 G03: modificado e nao rastreado', () => {
  const t = novo();
  assert.deepEqual(tudo(t, g03), []);
  t.escrever('src/exemplo.test.ts', 'mudou\n');
  t.escrever('src/alvo/novo.ts', 'x\n');
  assert.deepEqual(falhas(tudo(t, g03)), ['NAO_COMMITADO', 'NAO_RASTREADO']);
  assert.deepEqual(com(tudo(t, g03), 'NAO_RASTREADO').evidencia, ['src/alvo/novo.ts']);
  t.limpar();
});

test('C3 G03: staged sem commit e apagado tambem sao NAO_COMMITADO', () => {
  const t = novo();
  t.escrever('src/alvo/b.ts', 'x\n');
  t.g('add', 'src/alvo/b.ts');
  rmSync(path.join(t.pista, 'package.json'));
  assert.deepEqual(com(tudo(t, g03), 'NAO_COMMITADO').evidencia.sort(), ['package.json', 'src/alvo/b.ts']);
  t.limpar();
});

test('C3 G03: skip-worktree e assume-unchanged escondem a mudanca mas o ls-files -v acusa', () => {
  for (const flag of ['--skip-worktree', '--assume-unchanged']) {
    const t = novo();
    t.g('update-index', flag, 'packages/domain/index.ts');
    t.escrever('packages/domain/index.ts', 'escondido\n');
    const itens = tudo(t, g03);
    assert.deepEqual(falhas(itens), ['GIT_ESCONDENDO'], flag);
    assert.deepEqual(com(itens, 'GIT_ESCONDENDO').evidencia, ['packages/domain/index.ts']);
    t.limpar();
  }
});

test('C3 G03: ignorado com codigo reprova, de outro tipo avisa, excecoes e .agent/ nao geram nada', () => {
  const t = novo();
  t.commitar({ '.gitignore': 'node_modules\n.expo/\ndist/\ncoverage/\n*.tsbuildinfo\ngen/\nlixo.log\n.DS_Store\n' });
  t.escrever('src/gen/x.ts', 'x\n');
  t.escrever('lixo.log', 'x\n');
  t.escrever('.expo/x.ts', 'x\n');
  t.escrever('apps/mobile/dist/y.js', 'x\n');
  t.escrever('a.tsbuildinfo', 'x\n');
  t.escrever('coverage/lcov.info', 'x\n');
  t.escrever('.DS_Store', 'x\n');
  t.escrever('.agent/qualquer.ts', 'x\n');
  t.escrever('pacote.ts', 'ok\n', path.join(t.T, 'fora', 'nm')); // atras da juncao: o git nao pode descer
  const itens = tudo(t, g03);
  assert.deepEqual(falhas(itens), ['IGNORADO_SUSPEITO']);
  assert.deepEqual(com(itens, 'IGNORADO_SUSPEITO').evidencia, ['src/gen/x.ts']);
  assert.deepEqual(com(itens, 'IGNORADO').evidencia, ['lixo.log']);
  t.limpar();
});

test('C4 G04: fora da lista, de outro worker, pasta com barra, apagado e caixa', () => {
  const t = novo({ arquivos_permitidos: ['x/', 'src/alvo/'], arquivos_de_outro_worker: ['src/outro/'] });
  t.commitar({ 'x/y.ts': '1\n', 'xy.ts': '1\n', 'src/outro/o.ts': '1\n' });
  rmSync(path.join(t.pista, 'package.json'));
  t.commitar({}, 'apaga');
  t.commitarNoIndice('src/Alvo/c.ts', 'c\n');
  const itens = tudo(t, g04);
  assert.deepEqual(falhas(itens), ['FORA_DA_LISTA', 'OUTRO_WORKER']);
  assert.deepEqual(com(itens, 'FORA_DA_LISTA').evidencia.sort(), ['package.json', 'src/Alvo/c.ts', 'xy.ts']);
  assert.deepEqual(com(itens, 'OUTRO_WORKER').evidencia, ['src/outro/o.ts']);
  t.limpar();
});

test('C4 G04: renomear de dentro para fora da lista mostra os dois lados', () => {
  const t = novo({ arquivos_permitidos: ['src/exemplo.test.ts', 'src/alvo/'] });
  t.g('mv', 'src/exemplo.test.ts', 'src/novo.test.ts');
  t.g('commit', '-q', '-m', 'renomeia');
  assert.deepEqual(com(tudo(t, g04), 'FORA_DA_LISTA').evidencia, ['src/novo.test.ts']);
  assert.deepEqual(t.ctx().mudados().map((m) => `${m.estado}:${m.caminho}`).sort(), ['A:src/alvo/a.ts', 'A:src/novo.test.ts', 'D:src/exemplo.test.ts']);
  t.limpar();
});

test('C4 G04: symlink e submodulo commitados', () => {
  const t = novo();
  t.commitarNoIndice('src/alvo/link', 'packages/domain', '120000');
  t.commitarNoIndice('src/alvo/sub', '', '160000');
  assert.deepEqual(com(tudo(t, g04), 'SYMLINK_OU_SUBMODULO').evidencia.sort(), ['src/alvo/link', 'src/alvo/sub']);
  t.limpar();
});

test('C4 G04: base perdida, merge na branch e nenhum commit', () => {
  const t = novo();
  const lado = t.gm('commit-tree', `${t.base}^{tree}`, '-m', 'lado');
  assert.deepEqual(falhas(tudo(t, g04, ['--base', lado])), ['BASE_PERDIDA']);
  t.g('checkout', '-q', '-b', 'outra', t.base);
  t.commitar({ 'src/alvo/o.ts': 'o\n' });
  t.g('checkout', '-q', BRANCH);
  t.g('merge', '--no-ff', '-q', '-m', 'm', 'outra');
  assert.deepEqual(falhas(tudo(t, g04)), ['MERGE_NA_TAREFA']);
  t.limpar();
  const s = criarRepo();
  s.gravarContrato();
  assert.deepEqual(falhas(tudo(s, g04)), ['SEM_COMMIT']);
  s.limpar();
});

test('C5 G05: area sem autorizacao, autorizada nominal, autorizada so por pasta, caixa', () => {
  const t = novo();
  t.commitar({ 'packages/domain/x.ts': 'x\n', 'apps/mobile/src/db/schema.ts': 'mudou\n' });
  const a = tudo(t, g05);
  assert.deepEqual(falhas(a), ['AREA_PROTEGIDA']);
  assert.deepEqual(com(a, 'AREA_PROTEGIDA').evidencia.sort(), ['apps/mobile/src/db/schema.ts', 'packages/domain/x.ts']);
  t.limpar();

  const n = novo({ areas_autorizadas: ['packages/domain/'], arquivos_permitidos: ['src/alvo/', 'packages/domain/x.ts'] });
  n.commitar({ 'packages/domain/x.ts': 'x\n' });
  const b = tudo(n, g05);
  assert.deepEqual(falhas(b), []);
  assert.equal(com(b, 'AREA_AUTORIZADA_MUDOU').exigeRevisor, true);
  n.limpar();

  const p = novo({ areas_autorizadas: ['packages/domain/'], arquivos_permitidos: ['src/alvo/', 'packages/domain/'] });
  p.commitar({ 'packages/domain/x.ts': 'x\n' });
  assert.deepEqual(falhas(tudo(p, g05)), ['AREA_FORA_DA_LISTA']);
  p.limpar();

  const c = novo();
  c.commitarNoIndice('Packages/Domain/x.ts', 'x\n');
  assert.deepEqual(falhas(tudo(c, g05)), ['AREA_PROTEGIDA']);
  assert.deepEqual(com(tudo(c, g04), 'FORA_DA_LISTA').evidencia, ['Packages/Domain/x.ts']);
  c.limpar();
});

test('C5 G06: controle mudado reprova', () => {
  const t = novo({ arquivos_permitidos: ['src/alvo/', 'tools/agents/', '.claude/', 'sub/', 'opencode.json'] });
  t.commitar({ 'tools/agents/hooks/protected-paths.mjs': 'y\n', 'tools/agents/x.mjs': '1\n', '.claude/settings.json': '{}\n', 'sub/autorizacao.json': '{}\n', 'opencode.json': '{}\n' });
  const ctx = t.ctx();
  assert.deepEqual(com(g06(ctx), 'CONTROLE').evidencia.sort(), ['.claude/settings.json', 'opencode.json', 'sub/autorizacao.json', 'tools/agents/hooks/protected-paths.mjs', 'tools/agents/x.mjs']);
  assert.equal(ctx.achados.controle_tocados.length, 5);
  t.limpar();
});

test('C5 G06: excecao so por caminho exato ou pasta com barra; nenhuma outra verificacao libera', () => {
  const exc = (verificacao, caminho) => ({ verificacao, caminho, motivo: 'teste' });
  const casos = [
    [[exc('G06', 'tools/agents/x.mjs')], []],
    [[exc('G06', 'tools/agents/')], []],
    [[exc('G06', 'tools/agents')], ['CONTROLE']], // sem barra nao e pasta
    [[exc('G06', 'tools/agents/y.mjs')], ['CONTROLE']],
    [[exc('G06', 'Tools/Agents/x.mjs')], ['CONTROLE']], // caixa estrita na excecao
    [[exc('G07', 'tools/agents/x.mjs'), exc('G08', 'tools/agents/x.mjs'), exc('G14', 'tools/agents/x.mjs')], ['CONTROLE']],
  ];
  for (const [excecoes_gate, esperado] of casos) {
    const s = novo({ arquivos_permitidos: ['src/alvo/', 'tools/agents/'], excecoes_gate });
    s.commitar({ 'tools/agents/x.mjs': '1\n' });
    assert.deepEqual(falhas(tudo(s, g06)), esperado, JSON.stringify(excecoes_gate));
    s.limpar();
  }
});

const TESTE = 'src/exemplo.test.ts';
const alterar = (t, fn) => t.commitar({ [TESTE]: fn(readFileSync(path.join(t.pista, TESTE), 'utf8')) });
const apaga = (t) => {
  rmSync(path.join(t.pista, TESTE));
  t.commitar({}, 'apaga');
};
const g07de = (cab, fn) => {
  const t = novo({ arquivos_permitidos: ['src/alvo/', TESTE, 'src/__snapshots__/', 'src/novo.test.ts'], ...cab });
  fn(t);
  const r = tudo(t, g07);
  t.limpar();
  return r;
};

test('C6 G07: teste existente afrouxado de cada jeito reprova com o motivo', () => {
  const casos = {
    'ganhou skip': (s) => s.replace("it('b'", "it.skip('b'"),
    'ganhou skip (describe)': (s) => s.replace("describe('x'", "describe.skip('x'"),
    'ganhou skip (test)': (s) => s + "test.skip('z', () => {});\n",
    'ganhou skip (only)': (s) => s.replace("it('b'", "it.only('b'"),
    'ganhou skip (todo)': (s) => s + "it.todo('z');\n",
    'ganhou skip (xit)': (s) => s.replace("it('b'", "xit('b'"),
    'ganhou skip (xdescribe)': (s) => s.replace("describe('x'", "xdescribe('x'"),
    'perdeu it/test': (s) => s.replace("  it('b', () => { expect(3).toBe(3); });\n", "  const b = () => { expect(3).toBe(3); };\n"),
    'perdeu expect/assert': (s) => s.replace(' expect(5).toBe(5);', ''),
  };
  for (const [motivo, fn] of Object.entries(casos)) {
    const r = g07de({}, (t) => alterar(t, fn));
    assert.deepEqual(falhas(r), ['TESTE_AFROUXADO'], motivo);
    assert.match(com(r, 'TESTE_AFROUXADO').evidencia[0], new RegExp(motivo.split(' (')[0]), motivo);
  }
});

test('C6 G07: apagar o teste e mexer no snapshot reprovam', () => {
  let r = g07de({}, apaga);
  assert.match(com(r, 'TESTE_AFROUXADO').evidencia[0], /apagado/);
  r = g07de({}, (t) => t.commitar({ 'src/__snapshots__/exemplo.test.ts.snap': 'outra\n' }));
  assert.match(com(r, 'TESTE_AFROUXADO').evidencia[0], /snapshot/);
});

test('C6 G07: reformatar avisa; acrescentar nao diz nada; excecao exata passa com aviso; teste novo com skip so avisa', () => {
  const abre = "it('a', () => { expect(1).toBe(1); expect(2).toBe(2); });";
  let r = g07de({}, (t) => alterar(t, (s) => s.replace(abre, "it('a', () => {\n    expect(1).toBe(1);\n    expect(2).toBe(2);\n  });")));
  assert.deepEqual([falhas(r), avisos(r)], [[], ['REFORMATADO']]);
  r = g07de({}, (t) => alterar(t, (s) => s + "it('d', () => { expect(6).toBe(6); });\n"));
  assert.deepEqual(r, []);
  r = g07de({ excecoes_gate: [{ verificacao: 'G07', caminho: TESTE, motivo: 'obsoleto' }] }, apaga);
  assert.deepEqual([falhas(r), avisos(r)], [[], ['EXCECAO_G07']]);
  r = g07de({ excecoes_gate: [{ verificacao: 'G07', caminho: 'src/outro.test.ts', motivo: 'x' }] }, apaga);
  assert.deepEqual(falhas(r), ['TESTE_AFROUXADO']);
  r = g07de({}, (t) => t.commitar({ 'src/novo.test.ts': "it.skip('n', () => {});\n" }));
  assert.deepEqual([falhas(r), avisos(r)], [[], ['TESTE_NOVO_PULADO']]);
});

test('C7 G08: configuracao exige o arquivo nominal; pasta nao basta; excecao exata libera com aviso', () => {
  const t = novo({ arquivos_permitidos: ['src/alvo/', 'apps/mobile/'] });
  t.commitar({ 'package.json': '{"a":1}\n', 'apps/mobile/tsconfig.json': '{}\n', '.gitignore': 'x\n', 'apps/mobile/app.config.ts': 'x\n', 'package-lock.json': '{}\n' });
  const itens = tudo(t, g08);
  assert.deepEqual(falhas(itens), ['CONFIGURACAO']);
  assert.deepEqual(com(itens, 'CONFIGURACAO').evidencia.sort(), ['.gitignore', 'apps/mobile/app.config.ts', 'apps/mobile/tsconfig.json', 'package-lock.json', 'package.json']);
  t.limpar();
  const n = novo({ arquivos_permitidos: ['src/alvo/', 'package.json', 'apps/mobile/tsconfig.json'], excecoes_gate: [{ verificacao: 'G08', caminho: '.gitignore', motivo: 'x' }] });
  n.commitar({ 'package.json': '{"a":1}\n', 'apps/mobile/tsconfig.json': '{}\n', '.gitignore': 'x\n' });
  assert.deepEqual([falhas(tudo(n, g08)), avisos(tudo(n, g08))], [[], ['EXCECAO_G08']]);
  n.limpar();
});

test('C7 G08: node_modules que virou pasta real e DEPENDENCIA_INSTALADA', () => {
  const t = novo();
  assert.deepEqual(tudo(t, g08), []);
  rmdirSync(path.join(t.pista, 'node_modules'));
  mkdirSync(path.join(t.pista, 'node_modules', 'pacote'), { recursive: true });
  assert.deepEqual(falhas(tudo(t, g08)), ['DEPENDENCIA_INSTALADA']);
  assert.deepEqual(tudo(t, g03), []); // a pasta e ignorada e a excecao e por nome: quem pega e o G08
  t.limpar();
});

test('C7 G14: arquivo grande, extensao de dados e pasta de dados; excecao exata; aviso de contato', () => {
  const t = novo({ arquivos_permitidos: ['src/alvo/', 'docs/', 'dados/'] });
  t.commitar({ 'src/alvo/grande.ts': 'a'.repeat(600 * 1024), 'src/alvo/pequeno.ts': 'a'.repeat(1000), 'src/alvo/t.csv': 'a,b\n', 'docs/x.md': 'oi\n', 'dados/y.txt': 'oi\n' });
  const itens = tudo(t, g14);
  assert.deepEqual(falhas(itens), ['DADO_PROIBIDO']);
  assert.deepEqual(com(itens, 'DADO_PROIBIDO').evidencia.map((e) => e.split(':')[0]).sort(), ['dados/y.txt', 'docs/x.md', 'src/alvo/grande.ts', 'src/alvo/t.csv']);
  t.limpar();
  const n = novo({ arquivos_permitidos: ['src/alvo/', 'docs/x.md'], excecoes_gate: [{ verificacao: 'G14', caminho: 'docs/x.md', motivo: 'x' }] });
  n.commitar({ 'docs/x.md': 'oi\n', 'src/alvo/c.ts': '// falar com joao@exemplo.com\n' });
  const r = tudo(n, g14);
  assert.deepEqual([falhas(r), avisos(r)], [[], ['CONTATO_NO_DIFF', 'EXCECAO_G14']]);
  n.limpar();
});

test('C7 G14: binario no diff e aviso', () => {
  const t = novo();
  writeFileSync(path.join(t.pista, 'src/alvo/b.bin'), Buffer.from([0, 255, 0, 1]));
  t.g('add', 'src/alvo/b.bin');
  t.g('commit', '-q', '-m', 'bin');
  assert.deepEqual(avisos(tudo(t, g14)), ['ARQUIVO_BINARIO']);
  t.limpar();
});

test('C8 G11: item a menos, texto diferente, ordem trocada, resultado incoerente, hipotese sem app', () => {
  const t = novo();
  assert.deepEqual(tudo(t, g11), []);
  const itens = t.cabecalho.criterios.map((c) => ({ criterio: c, status: 'provado_por_teste', evidencia: 'x' }));
  const naoFeito = { ...itens[0], status: 'nao_feito', evidencia: '' };
  const casos = [
    [{ itens: itens.slice(0, 1) }, ['ITENS_DIVERGENTES']],
    [{ itens: [{ ...itens[0], criterio: 'C1 outro' }, itens[1]] }, ['ITENS_DIVERGENTES']],
    [{ itens: [itens[1], itens[0]] }, ['ITENS_DIVERGENTES']],
    [{ itens: [naoFeito, itens[1]], resultado: 'ok' }, ['RESULTADO_INCOERENTE']],
    [{ itens: [{ ...itens[0], evidencia: '  ' }, itens[1]] }, ['RESULTADO_INCOERENTE']],
    [{ itens: [naoFeito, itens[1]], resultado: 'parcial' }, []],
  ];
  for (const [parcial, esperado] of casos) {
    t.gravarRelatorio(parcial);
    assert.deepEqual(falhas(tudo(t, g11)), esperado, JSON.stringify(parcial));
  }
  t.gravarRelatorio({ itens: [{ ...itens[0], status: 'hipotese_aparelho' }, itens[1]] });
  assert.deepEqual(avisos(tudo(t, g11)), ['HIPOTESE_SEM_APP']);
  rmSync(t.relatorioPath);
  assert.equal(tudo(t, g11)[0].status, 'nao_rodou');
  t.limpar();
});

test('C8 G13: tempo acima do limite avisa; sem meta avisa SEM_META', () => {
  const t = novo({}, 'despacho');
  assert.deepEqual(tudo(t, g13), []);
  t.gravarMeta({ duracao_s: 301 });
  assert.deepEqual(avisos(tudo(t, g13)), ['TEMPO_ESTOUROU']);
  t.gravarMeta({ duracao_s: 300 });
  assert.deepEqual(tudo(t, g13), []);
  rmSync(path.join(t.dirDespacho, 'meta.json'));
  assert.deepEqual(avisos(tudo(t, g13)), ['SEM_META']);
  t.limpar();
  const m = novo();
  assert.deepEqual(avisos(tudo(m, g13)), ['SEM_META']);
  m.limpar();
});

test('C9 G15: escrita no repositorio principal, exclude, config local e config.worktree', () => {
  const casos = {
    'arquivo novo': [(t) => t.escrever('novo.txt', 'x\n', t.repo), 'ESCRITA_FORA_DA_PISTA'],
    commit: [(t) => t.gm('commit', '--allow-empty', '-q', '-m', 'x'), 'ESCRITA_FORA_DA_PISTA'],
    'info/exclude': [(t) => appendFileSync(path.join(t.repo, '.git', 'info', 'exclude'), 'packages/\n'), 'GIT_CONFIG_ALTERADO'],
    'config local': [(t) => t.gm('config', '--local', 'foo.bar', 'baz'), 'GIT_CONFIG_ALTERADO'],
    'config.worktree': [(t) => writeFileSync(path.join(t.g('rev-parse', '--absolute-git-dir'), 'config.worktree'), '[a]\n'), 'GIT_CONFIG_ALTERADO'],
  };
  const t0 = novo({}, 'despacho');
  assert.deepEqual(tudo(t0, g15), []);
  t0.limpar();
  for (const [nome, [acao, codigo]] of Object.entries(casos)) {
    const t = novo({}, 'despacho');
    acao(t);
    assert.ok(falhas(tudo(t, g15)).includes(codigo), nome);
    t.limpar();
  }
  const m = novo();
  assert.deepEqual(avisos(tudo(m, g15)), ['SEM_RETRATO']);
  m.limpar();
});

test('C7 D2 G14: linha de 1 MB sem @ nao e quadratica; contato real continua acusando', () => {
  for (const [nome, unidade] of [['a', 'a'], ['espaco', ' '], ['a ponto', 'a.']]) {
    const t = novo({ arquivos_permitidos: ['src/alvo/'] });
    t.commitar({ 'src/alvo/linha.ts': unidade.repeat((1024 * 1024) / unidade.length) + '\n' });
    const ini = Date.now();
    const itens = tudo(t, g14);
    assert.ok(Date.now() - ini < 3000, `${nome}: ${Date.now() - ini} ms`);
    assert.equal(com(itens, 'CONTATO_NO_DIFF'), undefined, nome);
    t.limpar();
  }
  const n = novo({ arquivos_permitidos: ['src/alvo/'] });
  n.commitar({ 'src/alvo/e.ts': '// joao@exemplo.com\n', 'src/alvo/f.ts': '// +351 912 345 678\n' });
  assert.deepEqual(com(tudo(n, g14), 'CONTATO_NO_DIFF').evidencia.sort(), ['src/alvo/e.ts', 'src/alvo/f.ts']);
  n.limpar();
});

test('C7 D3 G07: excecao com pasta nao libera', () => {
  const r = g07de({ excecoes_gate: [{ verificacao: 'G07', caminho: 'src/', motivo: 'x' }] }, apaga);
  assert.deepEqual(falhas(r), ['TESTE_AFROUXADO']);
  assert.deepEqual(avisos(r), []);
});

test('C7 D3 G08: excecao com pasta nao libera', () => {
  const t = novo({ arquivos_permitidos: ['src/alvo/'], excecoes_gate: [{ verificacao: 'G08', caminho: 'pasta/', motivo: 'x' }] });
  t.commitar({ 'pasta/package.json': '{}\n' });
  const r = tudo(t, g08);
  assert.deepEqual(falhas(r), ['CONFIGURACAO']);
  assert.ok(!avisos(r).includes('EXCECAO_G08'));
  t.limpar();
});

test('C7 D3 G14: excecao com pasta nao libera', () => {
  const t = novo({ arquivos_permitidos: ['src/alvo/'], excecoes_gate: [{ verificacao: 'G14', caminho: 'pasta/', motivo: 'x' }] });
  t.commitar({ 'pasta/t.csv': 'a,b\n' });
  const r = tudo(t, g14);
  assert.deepEqual(falhas(r), ['DADO_PROIBIDO']);
  assert.ok(!avisos(r).includes('EXCECAO_G14'));
  t.limpar();
});

// regex sincrona nao e interrompida pelo timeout do node:test, entao a medida e feita em processo filho com limite de 3 s
test('C7 D2 G14: EMAIL e TELEFONE em linha de 1 MB terminam em menos de 3 s (processo filho)', () => {
  const mod = fileURLToPath(new URL('./estaticas.mjs', import.meta.url));
  for (const unidade of ['a', ' ', 'a.', '1 ', '+']) {
    const fonte = `import { EMAIL, TELEFONE } from ${JSON.stringify(pathToFileURL(mod).href)}; const l = ${JSON.stringify(unidade)}.repeat(1048576 / ${unidade.length}); EMAIL.test(l); TELEFONE.test(l);`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', fonte], { timeout: 3000, encoding: 'utf8' });
    assert.equal(r.status, 0, `${JSON.stringify(unidade)}: ${r.error?.code ?? r.stderr}`);
  }
});

// m2-h2: o G03 aceita so o hooks.json do agy e o opencode.json gerados pelo dispatch, com os bytes da copia do despacho
const COPIA_DE = { '.agents/hooks.json': 'hooks-agy.json', 'opencode.json': 'opencode-config.json' };
const hookGerado = (t, rel, naPista, naCopia = naPista) => {
  t.escrever(rel, naPista);
  if (naCopia !== null) t.escrever(COPIA_DE[rel], naCopia, t.dirDespacho);
};

test('C6 G03 (a)(b): hooks.json e opencode.json iguais a copia, nao rastreados, passam', () => {
  for (const rel of Object.keys(COPIA_DE)) {
    const t = novo();
    hookGerado(t, rel, '{"a":1}');
    assert.deepEqual(tudo(t, g03), [], rel);
    t.limpar();
  }
});

test('C6 G03 (c): conteudo diferente da copia e HOOK_ALTERADO, sem NAO_RASTREADO', () => {
  for (const rel of Object.keys(COPIA_DE)) {
    const t = novo();
    hookGerado(t, rel, '{"a":1}', '{"a":2}');
    const itens = tudo(t, g03);
    assert.deepEqual(falhas(itens), ['HOOK_ALTERADO'], rel);
    assert.deepEqual(com(itens, 'HOOK_ALTERADO').evidencia, [rel]);
    t.limpar();
  }
});

test('C6 G03 (d): sem copia (modo manual sem despacho) continua NAO_RASTREADO', () => {
  for (const rel of Object.keys(COPIA_DE)) {
    const t = novo();
    hookGerado(t, rel, '{"a":1}', null);
    assert.deepEqual(com(tudo(t, g03), 'NAO_RASTREADO').evidencia, [rel]);
    t.limpar();
  }
});

test('C6 G03 (e): so as duas chaves tem excecao; outros arquivos novos seguem NAO_RASTREADO', () => {
  const t = novo();
  hookGerado(t, '.agents/hooks.json', '{"a":1}');
  hookGerado(t, 'opencode.json', '{"a":1}');
  t.escrever('.agents/skills/x.md', 'x\n');
  t.escrever('opencode.jsonc', '{}\n');
  t.escrever('.agents/hooks.json.bak', '{"a":1}');
  assert.deepEqual(com(tudo(t, g03), 'NAO_RASTREADO').evidencia.sort(), ['.agents/hooks.json.bak', '.agents/skills/x.md', 'opencode.jsonc']);
  t.limpar();
});

test('C6 G03: arquivo de hook rastreado e modificado continua NAO_COMMITADO', () => {
  const t = novo();
  t.commitar({ 'opencode.json': '{"a":1}' });
  t.escrever('opencode.json', '{"a":2}');
  assert.deepEqual(com(tudo(t, g03), 'NAO_COMMITADO').evidencia, ['opencode.json']);
  t.limpar();
});

test('C6 (f) hooks.json ou opencode.json commitado fora de arquivos_permitidos reprova no G04 e no G06', () => {
  for (const rel of Object.keys(COPIA_DE)) {
    const t = novo();
    hookGerado(t, rel, '{"a":1}');
    t.commitar({ [rel]: '{"a":1}' });
    assert.deepEqual(com(tudo(t, g04), 'FORA_DA_LISTA').evidencia, [rel], rel);
    assert.deepEqual(com(tudo(t, g06), 'CONTROLE').evidencia, [rel], rel);
    t.limpar();
  }
});
