import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const lerTrava = (arquivo) => {
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'));
  } catch {
    return null;
  }
};

export const adquirir = ({ raiz, id, minutos, max, agora = Date.now() }) => {
  const dir = path.join(raiz, '_despacho', '_trava');
  mkdirSync(dir, { recursive: true });
  const ativos = [];
  for (const nome of readdirSync(dir).filter((n) => n.endsWith('.lock'))) {
    const arquivo = path.join(dir, nome);
    const t = lerTrava(arquivo);
    // vencida (ou ilegivel): o dono morreu sem liberar
    if (!t || agora - t.inicio > 2 * 60000 * t.minutos) rmSync(arquivo, { force: true });
    else ativos.push(t.id);
  }
  if (ativos.includes(id)) return { ok: false, codigo: 'JA_EM_ANDAMENTO', ativos };
  if (ativos.length >= max) return { ok: false, codigo: 'TRAVA_CHEIA', ativos };
  const arquivo = path.join(dir, `${id}.lock`);
  writeFileSync(arquivo, JSON.stringify({ id, pid: process.pid, inicio: agora, minutos }));
  return { ok: true, liberar: () => rmSync(arquivo, { force: true }) };
};
