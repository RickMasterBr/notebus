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

// X10 (substitui o C1 que afirmava PENDENTE_C2 e inconclusivo por pendencia): so o modo --so-estatico guarda isso
test('C1 CLI: --so-estatico mantem G09/G10/G12/G16 PENDENTE_C2, sai 3 e nunca aprova', () => {
  const t = novo();
  const r = t.rodar(['--so-estatico']);
  assert.deepEqual([r.codigo, r.stdout], [3, 'INCONCLUSIVO t-teste PENDENTE_C2']);
  assert.deepEqual(validar(SCHEMA_GATE, r.gate).erros, []);
  assert.equal(r.gate.resultado, 'inconclusivo');
  assert.equal(r.gate.head, t.head());
  assert.equal(r.gate.base, t.base);
  for (const id of ['G09', 'G10', 'G12', 'G16']) assert.ok(r.tem(id, 'PENDENTE_C2', 'nao_rodou'), id);
  assert.deepEqual(r.gate.verificacoes.filter((v) => v.status === 'falha'), []);
  assert.deepEqual(r.gate.comandos, []);
  assert.deepEqual(r.gate.arquivos.mudados, [{ caminho: 'src/alvo/a.ts', estado: 'A', modo: '100644' }]);
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

// c2: comandos falsos node -e; o minimo vem de um --config de teste (t.configurar), sem npm nem expo
// tempo-limite de 10 s: o pwsh leva 1 a 4 s para subir com a maquina carregada e os comandos que devem passar nao podem estourar
const comMinimo = (t, comandos, tempo = 10) => t.configurar({ minimo: [{ prefixo: 'src/alvo/', comandos }], tempo });
const OK = 'node -e "process.exit(0)"';
const QUEBRA = 'node -e "console.error(\'erro: quebrou\');process.exit(1)"';
const DORME = 'node -e "setTimeout(()=>{},60000)"';
const AUSENTE = 'comando-que-nao-existe-xyz';
const ESCREVE_RASTREADO = 'node -e "require(\'fs\').appendFileSync(\'package.json\',\' \')"';
const CRIA_CACHE = 'node -e "require(\'fs\').mkdirSync(\'.expo\',{recursive:true});require(\'fs\').writeFileSync(\'.expo/c.txt\',\'x\')"';
const COMMITA = 'git -c user.name=t -c user.email=t@t commit -q --allow-empty -m x';
const MARCA = 'node -e "require(\'fs\').writeFileSync(\'../marca-x9.txt\',\'x\')"';

test('X3 gate: comando que passa do tempo da inconclusivo COMANDO_SEM_TEMPO (3) e os seguintes rodam', () => {
  const t = novo();
  comMinimo(t, [DORME, OK]);
  const r = t.rodar();
  assert.deepEqual([r.codigo, r.stdout], [3, 'INCONCLUSIVO t-teste COMANDO_SEM_TEMPO']);
  assert.deepEqual(r.gate.comandos.map((c) => c.status), ['sem_tempo', 'concluido', 'concluido']);
  assert.deepEqual(r.gate.comandos.map((c) => c.codigo_saida), [null, 0, 0]);
  t.limpar();
});

test('X3 gate: comando inexistente da inconclusivo FERRAMENTA_AUSENTE (3) e o seguinte roda', () => {
  const t = novo();
  comMinimo(t, [AUSENTE, OK]);
  const r = t.rodar();
  assert.deepEqual([r.codigo, r.stdout], [3, 'INCONCLUSIVO t-teste FERRAMENTA_AUSENTE']);
  assert.deepEqual(r.gate.comandos.map((c) => c.status), ['ferramenta_ausente', 'concluido', 'concluido']);
  t.limpar();
});

test('X4 G09: comando do contrato que falha reprova COMANDO_FALHOU (1) e o resumo traz so a falha', () => {
  const t = novo({ comandos_validacao: [QUEBRA] });
  t.gravarRelatorio({ comandos: [{ comando: QUEBRA, duracao_s: 0, codigo_saida: 1, resumo: 'erro' }] });
  const r = t.rodar();
  assert.deepEqual([r.codigo, r.stdout, r.falhas('G09')], [1, 'REPROVADO t-teste COMANDO_FALHOU', ['COMANDO_FALHOU']]);
  assert.deepEqual(r.gate.comandos.map((c) => [c.origem, c.resumo]), [['contrato', 'erro: quebrou']]);
  t.limpar();
});

test('X4 G09: comando do minimo que falha reprova; o comando do contrato acrescenta e nunca tira o minimo', () => {
  const t = novo();
  comMinimo(t, [QUEBRA]);
  const r = t.rodar();
  assert.deepEqual([r.codigo, r.falhas('G09')], [1, ['COMANDO_FALHOU']]);
  assert.deepEqual(r.gate.comandos.map((c) => [c.origem, c.comando]), [['minimo', QUEBRA], ['contrato', 'node --version']]);
  t.limpar();
});

test('X6 G10: relatorio sem um arquivo mudado reprova RELATORIO_OUTRO_ESTADO', () => {
  const t = novo();
  t.gravarRelatorio({ arquivos_mudados: [] });
  const r = t.rodar();
  assert.deepEqual([r.codigo, r.falhas('G10')], [1, ['RELATORIO_OUTRO_ESTADO']]);
  assert.equal(r.gate.divergencias[0].efeito, 'falha');
  t.limpar();
});

test('X6 G10: relatorio diz 0 onde o comando falha reprova RELATORIO_ESCONDE_FALHA', () => {
  const t = novo({ comandos_validacao: [QUEBRA] });
  const r = t.rodar();
  assert.deepEqual([r.codigo, r.falhas('G09'), r.falhas('G10')], [1, ['COMANDO_FALHOU'], ['RELATORIO_ESCONDE_FALHA']]);
  t.limpar();
});

test('X7 G12: contagem diferente do relatorio e so divergencia com efeito aviso; arquivo novo conta tudo', () => {
  const t = novo();
  t.commitar({ 'src/alvo/n.test.ts': "it('a', () => {});\nit('b', () => {});\nit('c', () => {});\n" });
  t.gravarRelatorio({ testes_novos_por_arquivo: { 'src/alvo/n.test.ts': 2 } });
  const r = t.rodar();
  assert.equal(r.codigo, 0);
  assert.deepEqual(r.gate.testes.novos_por_arquivo, { 'src/alvo/n.test.ts': 3 });
  assert.deepEqual(r.gate.divergencias, [{ campo: 'testes_novos_por_arquivo', relatorio: { 'src/alvo/n.test.ts': 2 }, gate: { 'src/alvo/n.test.ts': 3 }, efeito: 'aviso' }]);
  assert.ok(r.gate.avisos.includes('CONTAGEM_DIVERGENTE'));
  t.gravarRelatorio({ testes_novos_por_arquivo: { 'src/alvo/n.test.ts': 3 } });
  const certo = t.rodar();
  assert.deepEqual([certo.codigo, certo.gate.divergencias], [0, []]);
  t.limpar();
});

test('X8 G16: comando que reescreve arquivo rastreado reprova PISTA_MUDOU_NO_GATE (1)', () => {
  const t = novo({ comandos_validacao: [ESCREVE_RASTREADO] });
  const r = t.rodar();
  assert.deepEqual([r.codigo, r.falhas('G16')], [1, ['PISTA_MUDOU_NO_GATE']]);
  assert.match(r.gate.verificacoes.find((v) => v.id === 'G16').evidencia.join(), /package\.json/);
  t.limpar();
});

test('X8 G16: HEAD mudado por comando e falha; cache novo dentro das excecoes e so aviso', () => {
  const h = novo({ comandos_validacao: [COMMITA] });
  assert.deepEqual([h.rodar().falhas('G16')], [['PISTA_MUDOU_NO_GATE']]);
  h.limpar();
  const c = novo({ comandos_validacao: [CRIA_CACHE] });
  const r = c.rodar();
  assert.deepEqual([r.codigo, r.falhas('G16'), r.tem('G16', 'CACHE_NOVO', 'aviso')], [0, [], true]);
  c.limpar();
});

test('X9 gate: estatica reprovada pula G09/G10/G12/G16 sem executar nada; --executar-sempre executa', () => {
  const t = novo({ comandos_validacao: [MARCA] });
  t.escrever('src/exemplo.test.ts', 'sujo\n');
  const marca = path.join(t.T, 'pistas', 'marca-x9.txt');
  const r = t.rodar();
  assert.equal(r.codigo, 1);
  for (const id of ['G09', 'G10', 'G12', 'G16']) assert.ok(r.tem(id, 'PULADO_POR_FALHA_ESTATICA', 'nao_rodou'), id);
  assert.deepEqual([r.gate.comandos, existsSync(marca)], [[], false]);
  const forcado = t.rodar(['--executar-sempre']);
  assert.equal(forcado.codigo, 1);
  assert.equal(existsSync(marca), true);
  assert.equal(forcado.gate.comandos.length, 1);
  t.limpar();
});

test('X10 gate: tudo ok aprova (0) com APROVADO, comandos[], testes e gate-historico; a saida do comando fica so no arquivo', () => {
  const t = novo();
  // o marcador e montado no comando: o texto dele (que vai para o gate.json) nao contem a saida
  comMinimo(t, ['node -e "console.log(\'primeira-\'+\'linha-xyz\');console.log(\'ultima\')"']);
  const r = t.rodar();
  assert.deepEqual([r.codigo, r.stdout], [0, `APROVADO t-teste ${t.head().slice(0, 7)}`]);
  assert.equal(r.gate.resultado, 'aprovado');
  assert.deepEqual(validar(SCHEMA_GATE, r.gate).erros, []);
  assert.deepEqual(r.gate.comandos.map((c) => [c.origem, c.codigo_saida, c.resumo, c.saida]), [['minimo', 0, 'ultima', 'gate/1.txt'], ['contrato', 0, r.gate.comandos[1].resumo, 'gate/2.txt']]);
  assert.ok(r.gate.comandos.every((c) => c.duracao_s >= 0 && c.comando));
  assert.deepEqual(r.gate.testes, { novos_por_arquivo: {}, execucao: [] });
  assert.match(readFileSync(path.join(t.saida, 'gate', '1.txt'), 'utf8'), /primeira-linha-xyz/);
  assert.ok(!JSON.stringify(r.gate).includes('primeira-linha-xyz'));
  assert.equal(readdirSync(path.join(t.saida, 'gate-historico')).length, 1);
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
  assert.equal(t.rodar().codigo, 0);
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
  assert.equal(r.codigo, 0);
  assert.equal(r.gate.modo, 'despacho');
  assert.ok(existsSync(path.join(t.dirDespacho, 'gate.json')));
  assert.deepEqual(r.gate.verificacoes.filter((v) => ['G13', 'G15'].includes(v.id) && v.status !== 'ok'), []);
  rmSync(path.join(t.dirDespacho, "meta.json"));
  assert.ok(t.rodar().tem('G13', 'SEM_META', 'aviso'));
  t.limpar();
});

test('C1 D1 CLI: o gate nao roda diff.external nem textconv da pista', () => {
  const t = novo({ arquivos_permitidos: ['src/alvo/', '.gitattributes'] });
  const marcador = t.armadilha();
  t.commitar({ 'src/alvo/b.ts': 'export const b = 1;\n', '.gitattributes': '* diff=x\n' });
  t.commitar({ 'src/alvo/b.ts': 'export const b = 2;\n' });
  t.gravarContrato();
  t.gravarRelatorio();
  const r = t.rodar();
  assert.ok(r.gate, r.stderr);
  assert.equal(existsSync(marcador), false, 'o gate rodou programa da pista');
  t.limpar();
});
