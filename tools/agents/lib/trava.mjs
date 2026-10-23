import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const lerTrava = (arquivo) => {
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'));
  } catch {
    return null;
  }
};

// antesDeCriar: gancho so de teste, roda entre a listagem e a criacao do arquivo
export const adquirir = ({ raiz, id, minutos, max, agora = Date.now(), pasta = '_trava', antesDeCriar }) => {
  if (!pasta || /[\\/]|\.\./.test(pasta)) throw Object.assign(new TypeError(`PASTA_INVALIDA: ${pasta}`), { code: 'PASTA_INVALIDA' });
  const dir = path.join(raiz, '_despacho', pasta);
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
  antesDeCriar?.(arquivo);
  try {
    // 'wx' fecha a janela entre checar e criar para o mesmo id
    writeFileSync(arquivo, JSON.stringify({ id, pid: process.pid, inicio: agora, minutos }), { flag: 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') return { ok: false, codigo: 'JA_EM_ANDAMENTO', ativos: [...ativos, id] };
    throw e;
  }
  return { ok: true, liberar: () => rmSync(arquivo, { force: true }) };
};
