import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const lerTrava = (arquivo) => {
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'));
  } catch {
    return null;
  }
};

// ESRCH: o processo nao existe; EPERM: existe, mas e de outro usuario
const donoMorto = (pid) => {
  if (!Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    return e.code === 'ESRCH';
  }
};

const SAIDA_POR_SINAL = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };

// Registra os tratadores de sinal; so recebe a funcao de liberar, nunca pista nem branch.
// Devolve a funcao que os remove (fim normal).
export const registrarSaida = (emissor, liberar, sair) => {
  const tratadores = Object.entries(SAIDA_POR_SINAL).map(([sinal, codigo]) => [sinal, () => { liberar(); sair(codigo); }]);
  for (const [sinal, f] of tratadores) emissor.on(sinal, f);
  return () => { for (const [sinal, f] of tratadores) emissor.off(sinal, f); };
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
    // ilegivel, vencida ou de dono morto: o dono saiu sem liberar
    if (!t || agora - t.inicio > 2 * 60000 * t.minutos || donoMorto(t.pid)) rmSync(arquivo, { force: true });
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
