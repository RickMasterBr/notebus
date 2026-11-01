import { linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

const GRACA_MS = 30000;

// Lista as travas ativas ({id, inicio}); apaga as vencidas, de dono morto ou ilegiveis antigas.
// shortcut: so o arquivo VAZIO tem a graca de 30 s (e o que sobrava da criacao antiga, em dois passos);
// texto torto continua descartado na hora, como o teste V2 exige. Ampliar se aparecer outra forma de ilegivel recente.
const listarAtivas = (dir, agora) => {
  const ativas = [];
  for (const nome of readdirSync(dir).filter((n) => n.endsWith('.lock'))) {
    const arquivo = path.join(dir, nome);
    const t = lerTrava(arquivo);
    if (t) {
      // vencida ou de dono morto: o dono saiu sem liberar
      if (agora - t.inicio > 2 * 60000 * t.minutos || donoMorto(t.pid)) rmSync(arquivo, { force: true });
      else ativas.push({ id: t.id, inicio: t.inicio });
      continue;
    }
    let vazia = false;
    let mtime = 0;
    try {
      vazia = statSync(arquivo).size === 0;
      mtime = statSync(arquivo).mtimeMs;
    } catch {
      continue; // sumiu entre a listagem e a leitura
    }
    if (vazia && agora - mtime < GRACA_MS) ativas.push({ id: nome.slice(0, -5), inicio: mtime });
    else rmSync(arquivo, { force: true });
  }
  return ativas;
};

// Tenta a cada intervaloS ate esperarS segundos; so TRAVA_CHEIA espera (JA_EM_ANDAMENTO volta na hora).
// relogio() devolve ms e dormir(ms) espera: entram por parametro para o teste nao usar tempo real.
export const adquirirComEspera = async ({ esperarS = 0, intervaloS = 5, relogio = Date.now, dormir = (ms) => new Promise((r) => setTimeout(r, ms)), aoEsperar, ...args }) => {
  const t0 = relogio();
  for (;;) {
    const r = adquirir({ ...args, agora: relogio() });
    const esperouS = Math.round((relogio() - t0) / 1000);
    if (r.ok || r.codigo !== 'TRAVA_CHEIA' || relogio() - t0 >= esperarS * 1000) return { ...r, esperouS };
    aoEsperar?.(r.ativos, esperouS);
    await dormir(intervaloS * 1000);
  }
};

const ordem =(a, b) => a.inicio - b.inicio || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// antesDeCriar e antesDeLinkar: ganchos so de teste (antes da criacao; entre o temporario completo e o nome final)
export const adquirir = ({ raiz, id, minutos, max, agora = Date.now(), pasta = '_trava', antesDeCriar, antesDeLinkar }) => {
  if (!pasta || /[\\/]|\.\./.test(pasta)) throw Object.assign(new TypeError(`PASTA_INVALIDA: ${pasta}`), { code: 'PASTA_INVALIDA' });
  const dir = path.join(raiz, '_despacho', pasta);
  mkdirSync(dir, { recursive: true });
  const ativos = listarAtivas(dir, agora).map((t) => t.id);
  if (ativos.includes(id)) return { ok: false, codigo: 'JA_EM_ANDAMENTO', ativos };
  if (ativos.length >= max) return { ok: false, codigo: 'TRAVA_CHEIA', ativos };
  const arquivo = path.join(dir, `${id}.lock`);
  const temp = path.join(dir, `${id}.${process.pid}.tmp`);
  antesDeCriar?.(arquivo);
  try {
    // grava inteiro no temporario e liga ao nome final: linkSync falha com EEXIST se o nome ja existe
    writeFileSync(temp, JSON.stringify({ id, pid: process.pid, inicio: agora, minutos }));
    antesDeLinkar?.(temp);
    linkSync(temp, arquivo);
  } catch (e) {
    if (e.code === 'EEXIST') return { ok: false, codigo: 'JA_EM_ANDAMENTO', ativos: [...ativos, id] };
    throw e;
  } finally {
    rmSync(temp, { force: true });
  }
  // dois com ids diferentes podem passar juntos: reconta e fica so com as max mais antigas
  const todas = listarAtivas(dir, agora).sort(ordem);
  if (!todas.slice(0, max).some((t) => t.id === id)) {
    rmSync(arquivo, { force: true });
    return { ok: false, codigo: 'TRAVA_CHEIA', ativos: todas.map((t) => t.id).filter((i) => i !== id) };
  }
  return { ok: true, liberar: () => rmSync(arquivo, { force: true }) };
};
