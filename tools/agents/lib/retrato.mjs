import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const sha = (dados) => createHash('sha256').update(dados).digest('hex');

// retrato do ambiente git antes do harness rodar; so le, nao escreve nada
export const retrato = ({ repo, git = execFileSync }) => {
  const rodar = (...args) => git('git', ['-C', repo, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const comum = path.resolve(repo, rodar('rev-parse', '--git-common-dir').toString('utf8').trim());
  let exclude;
  try {
    exclude = readFileSync(path.join(comum, 'info', 'exclude'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    exclude = 'ausente';
  }
  return {
    repo_head: rodar('rev-parse', 'HEAD').toString('utf8').trim(),
    repo_status_sha256: sha(rodar('status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=all')),
    exclude_sha256: sha(exclude),
    config_sha256: sha(rodar('config', '--local', '--list')),
  };
};
