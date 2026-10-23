import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerJson } from './lib/json.mjs';
import { validar } from './lib/schema.mjs';
import { adquirir } from './lib/trava.mjs';
import { criarRepo, gateBin, motivoPuloWindows } from './lib/gate-fixtures/repo-temporario.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_GATE = lerJson(path.join(AQUI, 'lib', 'gate-fixtures', 'gate.schema.json'));
const BYPASS = lerJson(path.join(AQUI, 'hooks', 'fixtures', 'bypass-conhecidos.json'));

const novo = (cab = {}, modo = 'manual') => {
  const t = criarRepo({ modo, contrato: cab });
  t.pronto();
  return t;
};
const arvore = (dir) => readdirSync(dir, { recursive: true }).sort().join('|');

test('C1 CLI: uso errado sai 2 e nao escreve nada', () => {
  const t = novo();
  const antes = arvore(t.T);
  const casos = {
    'sem argumentos': [],
    'flag desconhecida': [...t.argv(), '--nao-existe'],
    'contrato inexistente': [path.join(t.T, 'nao.md'), ...t.argv().slice(1)],
    '--pista sem --relatorio': [t.contratoPath, '--repo', t.repo, '--pista', t.pista, '--branch', 'b', '--saida', t.saida],
    '--pista sem --branch': [t.contratoPath, '--repo', t.repo, '--pista', t.pista, '--relatorio', t.relatorioPath, '--saida', t.saida],
    '--pista sem --saida': [t.contratoPath, '--repo', t.repo, '--pista', t.pista, '--relatorio', t.relatorioPath, '--branch', 'b'],
  };
  for (const [nome, args] of Object.entries(casos)) {
    const r = t.bruto(args);
    assert.equal(r.codigo, 2, nome);
    assert.match(r.stderr, /^FALHA \w+ /, nome);
    assert.equal(arvore(t.T), antes, nome);
  }
  t.limpar();
});

test('C1 CLI: tudo estatico ok sai 3 inconclusivo, G09/G10/G12/G16 PENDENTE_C2, gate.json valido', () => {
  const t = novo();
  const r = t.rodar();
  assert.deepEqual([r.codigo, r.stdout], [3, 'INCONCLUSIVO t-teste PENDENTE_C2']);
  assert.deepEqual(validar(SCHEMA_GATE, r.gate).erros, []);
  assert.equal(r.gate.versao, 1);
  assert.equal(r.gate.resultado, 'inconclusivo');
  assert.equal(r.gate.head, t.head());
  assert.equal(r.gate.base, t.base);
  for (const id of ['G09', 'G10', 'G12', 'G16']) assert.ok(r.tem(id, 'PENDENTE_C2', 'nao_rodou'), id);
  assert.deepEqual(r.gate.verificacoes.filter((v) => v.status === 'falha'), []);
  assert.deepEqual(r.gate.arquivos.mudados, [{ caminho: 'src/alvo/a.ts', estado: 'A', modo: '100644' }]);
  // --so-estatico e --executar-sempre sao aceitas e nao mudam nada no c1
  assert.equal(t.rodar(['--so-estatico']).codigo, 3);
  assert.equal(t.rodar(['--executar-sempre']).codigo, 3);
  t.limpar();
});

test('C1 CLI: uma falha sai 1 reprovado e a linha lista os codigos', () => {
  const t = novo();
  t.escrever('src/exemplo.test.ts', 'sujo\n');
  const r = t.rodar();
  assert.deepEqual([r.codigo, r.stdout], [1, 'REPROVADO t-teste NAO_COMMITADO']);
  assert.equal(r.gate.resultado, 'reprovado');
  assert.deepEqual(validar(SCHEMA_GATE, r.gate).erros, []);
  t.limpar();
});

test('C1 CLI: contrato invalido em modo manual reprova com CONTRATO_INVALIDO e as outras nao rodam', () => {
  const t = novo();
  t.gravarContrato({ ...t.cabecalho, id: 'Invalido Mesmo' });
  const r = t.rodar(['--base', t.base]);
  assert.deepEqual([r.codigo, r.falhas('G01')], [1, ['CONTRATO_INVALIDO']]);
  assert.ok(r.tem('G04', 'SEM_CONTRATO', 'nao_rodou'));
  t.limpar();
});

test('C2 G00 CLI: gate rodando de dentro da pista sai 2 GATE_DENTRO_DA_PISTA e nao escreve', () => {
  const t = novo();
  const copia = path.join(t.pista, '_gate');
  cpSync(path.dirname(gateBin()), copia, { recursive: true });
  const antes = arvore(t.T);
  const r = t.bruto(t.argv(), path.join(copia, 'gate.mjs'));
  assert.deepEqual([r.codigo, /GATE_DENTRO_DA_PISTA/.test(r.stderr)], [2, true]);
  assert.equal(arvore(t.T), antes);
  assert.equal(existsSync(t.saida), false);
  t.limpar();
});

// C10: os 6 do hook terminam em packages/domain/x.ts em disco; commitado e nao commitado
const ALVO = 'packages/domain/x.ts';
const caminhosBypass = (t, i) => {
  if (i < 4) return [ALVO];
  const alias = i === 4 ? 'PACKAG~1/domain/x.ts' : 'packages./domain/x.ts';
  return [alias];
};
BYPASS.forEach((caso, i) => {
  for (const commitado of [true, false]) {
    const nome = `C10 bypass ${i + 1} (${commitado ? 'commitado' : 'nao commitado'}): ${caso.comando}`;
    test(nome, (ctx) => {
      const t = novo();
      if (i >= 4) {
        const motivo = motivoPuloWindows(t);
        if (motivo) {
          t.limpar();
          return ctx.skip(`pulado: ${motivo}`);
        }
      }
      for (const rel of caminhosBypass(t, i)) t.escrever(rel, 'export const x = 1;\n');
      if (commitado) t.commitar({}, 'bypass');
      const r = t.rodar();
      assert.equal(r.codigo, 1);
      if (commitado) {
        assert.deepEqual(r.falhas('G05'), ['AREA_PROTEGIDA']);
        assert.ok(r.falhas('G04').includes('FORA_DA_LISTA'));
        assert.ok(r.gate.arquivos.mudados.some((m) => m.caminho === ALVO));
      } else assert.ok(r.falhas('G03').includes('NAO_RASTREADO'));
      t.limpar();
    });
  }
});

test('C10 novo: .gitignore com a area vira CONFIGURACAO', () => {
  const t = novo();
  t.commitar({ '.gitignore': 'node_modules\npackages/domain/\n' });
  assert.ok(t.rodar().falhas('G08').includes('CONFIGURACAO'));
  t.limpar();
});

test('C10 novo: arquivo na area + info/exclude no principal (com retrato)', () => {
  const t = novo({}, 'despacho');
  appendFileSync(path.join(t.repo, '.git', 'info', 'exclude'), 'packages/domain/x.ts\n');
  t.escrever(ALVO, 'export const x = 1;\n');
  const r = t.rodar();
  assert.equal(r.codigo, 1);
  assert.ok(r.falhas('G15').includes('GIT_CONFIG_ALTERADO'));
  assert.ok(r.falhas('G03').includes('IGNORADO_SUSPEITO'));
  t.limpar();
});

test('C10 novo: symlink commitado para a area, escrita no principal, contrato editado, base perdida e merge', () => {
  const t = novo();
  t.commitarNoIndice('src/alvo/link', 'packages/domain', '120000');
  assert.ok(t.rodar().falhas('G04').includes('SYMLINK_OU_SUBMODULO'));
  t.limpar();

  const d = novo({}, 'despacho');
  d.escrever('lixo.txt', 'x\n', d.repo);
  assert.ok(d.rodar().falhas('G15').includes('ESCRITA_FORA_DA_PISTA'));
  d.limpar();

  const c = novo();
  appendFileSync(path.join(c.pista, '.agent', 'contrato.md'), 'worker mexeu\n');
  assert.deepEqual(c.rodar().falhas('G01'), ['CONTRATO_ALTERADO']);
  c.limpar();

  const b = novo();
  const lado = b.gm('commit-tree', `${b.base}^{tree}`, '-m', 'lado');
  assert.ok(b.rodar(['--base', lado]).falhas('G04').includes('BASE_PERDIDA'));
  b.g('checkout', '-q', '-b', 'outra', b.base);
  b.commitar({ 'src/alvo/o.ts': 'o\n' });
  b.g('checkout', '-q', 'tarefa/t-teste');
  b.g('merge', '--no-ff', '-q', '-m', 'm', 'outra');
  assert.ok(b.rodar().falhas('G04').includes('MERGE_NA_TAREFA'));
  b.limpar();
});

test('C10 novo: Packages/Domain/x.ts commitado com a caixa trocada da FORA_DA_LISTA e AREA_PROTEGIDA', () => {
  const t = novo();
  t.commitarNoIndice('Packages/Domain/x.ts', 'x\n');
  const r = t.rodar();
  assert.ok(r.falhas('G04').includes('FORA_DA_LISTA'));
  assert.deepEqual(r.falhas('G05'), ['AREA_PROTEGIDA']);
  t.limpar();
});

test('C11 CLI: duas rodadas gravam dois arquivos em gate-historico e o ultimo e igual ao gate.json', () => {
  const t = novo();
  t.rodar();
  t.escrever('src/alvo/novo.ts', 'x\n');
  const r = t.rodar();
  const hist = readdirSync(path.join(t.saida, 'gate-historico'));
  assert.equal(hist.length, 2);
  const textos = hist.map((n) => readFileSync(path.join(t.saida, 'gate-historico', n), 'utf8'));
  assert.ok(textos.includes(readFileSync(path.join(t.saida, 'gate.json'), 'utf8')));
  assert.equal(r.gate.resultado, 'reprovado');
  t.limpar();
});

test('C11 CLI: gate rodando bloqueia o segundo com GATE_OCUPADO (2); a trava e liberada em qualquer saida', () => {
  const t = novo();
  const dono = adquirir({ raiz: t.T, id: 'outro-gate', minutos: 60, max: 1, pasta: '_trava-gate' });
  assert.equal(dono.ok, true);
  const r = t.bruto(t.argv());
  assert.deepEqual([r.codigo, /GATE_OCUPADO/.test(r.stderr), existsSync(t.saida)], [2, true, false]);
  dono.liberar();
  const trava = path.join(t.T, '_despacho', '_trava-gate');
  const locks = () => readdirSync(trava).filter((n) => n.endsWith('.lock'));
  assert.equal(t.rodar().codigo, 3);
  assert.deepEqual(locks(), []);
  // excecao depois da trava: --saida aponta para um arquivo, gravar falha
  const arquivo = path.join(t.T, 'arquivo.txt');
  writeFileSync(arquivo, 'x');
  const e = t.bruto([...t.argv().slice(0, -1), arquivo]);
  assert.equal(e.codigo, 2);
  assert.match(e.stderr, /^FALHA ERRO_INTERNO/);
  assert.deepEqual(locks(), []);
  t.limpar();
});

test('C11 CLI: modo despacho le meta.json e grava na pasta do despacho', () => {
  const t = novo({}, 'despacho');
  const r = t.rodar();
  assert.equal(r.codigo, 3);
  assert.equal(r.gate.modo, 'despacho');
  assert.ok(existsSync(path.join(t.dirDespacho, 'gate.json')));
  assert.deepEqual(r.gate.verificacoes.filter((v) => ['G13', 'G15'].includes(v.id) && v.status !== 'ok'), []);
  rmSync(path.join(t.dirDespacho, "meta.json"));
  assert.ok(t.rodar().tem('G13', 'SEM_META', 'aviso'));
  t.limpar();
});
