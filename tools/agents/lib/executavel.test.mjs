import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverExecutavel, comandoParaSpawn, ErroExecutavel } from './executavel.mjs';
import { montarPrompt } from './despacho.mjs';

const achar = (...presentes) => (c) => presentes.includes(c);
const win = (exe, env, existe) => resolverExecutavel(exe, { plataforma: 'win32', env, existe });
const PATH = { PATH: 'C:\\a;C:\\b;C:\\c' };

test('C3 resolverExecutavel: .cmd achado no 2o diretorio do PATH', () => {
  assert.deepEqual(win('opencode', PATH, achar('C:\\b\\opencode.cmd')), { caminho: 'C:\\b\\opencode.cmd', tipo: 'cmd' });
});

test('C3 resolverExecutavel: .exe e .cmd no mesmo diretorio -> .exe', () => {
  assert.deepEqual(win('opencode', PATH, achar('C:\\a\\opencode.cmd', 'C:\\a\\opencode.exe')), { caminho: 'C:\\a\\opencode.exe', tipo: 'exe' });
});

test('C3 resolverExecutavel: .cmd no 1o diretorio vence .exe no 2o', () => {
  assert.deepEqual(win('opencode', PATH, achar('C:\\a\\opencode.cmd', 'C:\\b\\opencode.exe')), { caminho: 'C:\\a\\opencode.cmd', tipo: 'cmd' });
});

test('C3 resolverExecutavel: .ps1 e nome sem extensao nunca sao candidatos', () => {
  assert.equal(win('opencode', PATH, achar('C:\\a\\opencode.ps1', 'C:\\a\\opencode')), null);
});

test('C3 resolverExecutavel: caminho absoluto com extensao, com e sem separador final no PATH', () => {
  assert.deepEqual(win('C:\\x\\opencode.cmd', PATH, achar('C:\\x\\opencode.cmd')), { caminho: 'C:\\x\\opencode.cmd', tipo: 'cmd' });
  assert.deepEqual(win('C:\\x\\opencode', PATH, achar('C:\\x\\opencode.exe')), { caminho: 'C:\\x\\opencode.exe', tipo: 'exe' });
  assert.equal(win('C:\\x\\opencode', PATH, achar('C:\\x\\opencode')), null);
  assert.deepEqual(win('opencode', { PATH: 'C:\\a\\' }, achar('C:\\a\\opencode.bat')), { caminho: 'C:\\a\\opencode.bat', tipo: 'cmd' });
});

test('C3 resolverExecutavel: extensao em maiusculas', () => {
  assert.deepEqual(win('OPENCODE.CMD', PATH, achar('C:\\a\\OPENCODE.CMD')), { caminho: 'C:\\a\\OPENCODE.CMD', tipo: 'cmd' });
  assert.deepEqual(win('opencode.EXE', PATH, achar('C:\\c\\opencode.EXE')), { caminho: 'C:\\c\\opencode.EXE', tipo: 'exe' });
});

test('C3 resolverExecutavel: fora do win32 devolve o proprio exe sem consultar', () => {
  const existe = () => assert.fail('nao deveria consultar');
  assert.deepEqual(resolverExecutavel('opencode', { plataforma: 'linux', env: PATH, existe }), { caminho: 'opencode', tipo: 'exe' });
});

test('C4 comandoParaSpawn: exe direto, opcoes vazias; nulo mantem o exe de hoje', () => {
  assert.deepEqual(comandoParaSpawn({ exe: 'x', args: ['a'] }, { resolvido: { caminho: 'C:\\a\\x.exe', tipo: 'exe' } }), { exe: 'C:\\a\\x.exe', args: ['a'], opcoes: {} });
  assert.deepEqual(comandoParaSpawn({ exe: 'x', args: ['a'] }, { resolvido: null }), { exe: 'x', args: ['a'], opcoes: {} });
});

test('C4 comandoParaSpawn: .cmd roda por cmd.exe com string completa entre aspas e verbatim', () => {
  const r = { caminho: 'C:\\n\\opencode.cmd', tipo: 'cmd' };
  const c = { exe: 'opencode', args: ['run', 'faca isto', '--model', 'opencode/deepseek-v4.1-flash-free'] };
  assert.deepEqual(comandoParaSpawn(c, { resolvido: r, env: {} }), {
    exe: 'cmd.exe',
    args: ['/d', '/s', '/c', '""C:\\n\\opencode.cmd" "run" "faca isto" "--model" "opencode/deepseek-v4.1-flash-free""'],
    opcoes: { windowsVerbatimArguments: true },
  });
  assert.equal(comandoParaSpawn(c, { resolvido: r, env: { ComSpec: 'C:\\W\\cmd.exe' } }).exe, 'C:\\W\\cmd.exe');
});

test('C4 comandoParaSpawn: recusa " % ^ ! quebra de linha e barra invertida final', () => {
  const r = { caminho: 'C:\\n\\o.cmd', tipo: 'cmd' };
  for (const ruim of ['a"b', 'a%PATH%', 'a^b', 'a!b', 'a\nb', 'a\rb', 'a\tb', 'C:\\pasta\\']) {
    assert.throws(() => comandoParaSpawn({ exe: 'o', args: [ruim] }, { resolvido: r, env: {} }), (e) => e instanceof ErroExecutavel && e.codigo === 'ARGUMENTO_INSEGURO' && e.message.includes(JSON.stringify(ruim)), JSON.stringify(ruim));
  }
  assert.throws(() => comandoParaSpawn({ exe: 'o', args: [] }, { resolvido: { caminho: 'C:\\a%b\\o.cmd', tipo: 'cmd' }, env: {} }), { codigo: 'ARGUMENTO_INSEGURO' });
});

test('C4 comandoParaSpawn: aceita ; && | < > ( , o montarPrompt real e o modelo', () => {
  const r = { caminho: 'C:\\n\\o.cmd', tipo: 'cmd' };
  const args = ['a; b && c | d < e > f (g', montarPrompt({ id: 'tarefa-x' }), 'opencode/deepseek-v4.1-flash-free'];
  assert.equal(comandoParaSpawn({ exe: 'o', args }, { resolvido: r, env: {} }).opcoes.windowsVerbatimArguments, true);
});
