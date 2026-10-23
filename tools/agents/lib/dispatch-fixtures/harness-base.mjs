import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Relatorio de teste: RELATORIO escolhe o arquivo, RELATORIO_TAREFA troca o campo tarefa.
export const relatorio = () => {
  const id = /"id": "([^"]+)"/.exec(readFileSync('.agent/contrato.md', 'utf8'))[1];
  const r = JSON.parse(readFileSync(fileURLToPath(new URL(process.env.RELATORIO ?? 'relatorio-valido.json', import.meta.url)), 'utf8'));
  return { ...r, tarefa: process.env.RELATORIO_TAREFA ?? id };
};

export const commitaArquivo = () => {
  writeFileSync('feito.txt', 'feito\n');
  execFileSync('git', ['add', 'feito.txt']);
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'feito'], { stdio: 'ignore' });
};

export const gravaRelatorio = (r) => {
  mkdirSync('.agent', { recursive: true });
  writeFileSync('.agent/report.json', JSON.stringify(r));
};
