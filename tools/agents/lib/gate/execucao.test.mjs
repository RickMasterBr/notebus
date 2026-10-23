import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executar } from './execucao.mjs';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'gate-exec-'));
const roda = async (comando, { tempoLimiteS = 30, dir = tmp() } = {}) => {
  const r = await executar({ comando, pista: dir, saidaArquivo: path.join(dir, 'saida', '1.txt'), tempoLimiteS });
  return { ...r, dir };
};
const limpa = (dir) => rmSync(dir, { recursive: true, force: true });

test('X2 execucao: codigo 0, duracao >= 0 e saida no arquivo', async () => {
  const r = await roda('node -e "console.log(\'tudo ok\')"');
  assert.deepEqual([r.codigo_saida, r.status, r.duracao_s >= 0], [0, 'concluido', true]);
  assert.match(readFileSync(path.join(r.dir, 'saida', '1.txt'), 'utf8'), /tudo ok/);
  assert.equal(r.resumo, 'tudo ok');
  limpa(r.dir);
});

test('X2 execucao: falha da codigo diferente de 0 e resumo so com a linha de falha e a ultima, sem as linhas ok', async () => {
  const r = await roda('node -e "console.log(\'passou a\');console.log(\'passou b\');console.error(\'erro: quebrou aqui\');console.log(\'fim\');process.exit(3)"');
  // pwsh -Command so devolve 0 ou 1: o valor exato de process.exit(3) nao chega
  assert.deepEqual([r.codigo_saida !== 0, r.status], [true, 'concluido']);
  assert.equal(r.resumo, 'erro: quebrou aqui\nfim');
  limpa(r.dir);
});

test('X2 execucao: resumo limita a 20 linhas de falha mais a ultima', async () => {
  const r = await roda('node -e "for(let i=0;i<30;i++)console.log(\'erro \'+i);process.exit(1)"');
  assert.ok(r.resumo.split('\n').length <= 21);
  assert.ok(r.resumo.split('\n').length < 30);
  limpa(r.dir);
});

test('X3 execucao: tempo esgotado devolve sem_tempo e o filho (neto do shell) nao continua vivo', async () => {
  const dir = tmp();
  const r = await roda('node -e "require(\'fs\').writeFileSync(\'pid.txt\',String(process.pid));setTimeout(()=>{},60000)"', { tempoLimiteS: 4, dir });
  assert.equal(r.status, 'sem_tempo');
  assert.ok(existsSync(path.join(dir, 'pid.txt')), 'o comando nem chegou a iniciar em 4 s');
  const pid = Number(readFileSync(path.join(dir, 'pid.txt'), 'utf8'));
  await new Promise((ok) => setTimeout(ok, 500));
  let vivo = true;
  try {
    process.kill(pid, 0);
  } catch {
    vivo = false;
  }
  assert.equal(vivo, false, 'o processo filho continua vivo');
  limpa(dir);
});

test('X3 execucao: comando inexistente devolve ferramenta_ausente', async () => {
  const r = await roda('comando-que-nao-existe-xyz');
  assert.equal(r.status, 'ferramenta_ausente');
  limpa(r.dir);
});

test('X3 execucao: falha comum nao e confundida com ferramenta ausente', async () => {
  const r = await roda('node -e "process.exit(1)"');
  assert.deepEqual([r.codigo_saida, r.status], [1, 'concluido']);
  limpa(r.dir);
});
