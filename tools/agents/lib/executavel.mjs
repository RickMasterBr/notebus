import { existsSync } from 'node:fs';
import path from 'node:path';

export class ErroExecutavel extends Error {
  constructor(codigo, texto) {
    super(texto);
    this.codigo = codigo;
  }
}

const EXTENSOES = ['.exe', '.cmd', '.bat'];
const extensaoDe = (p) => EXTENSOES.find((e) => p.toLowerCase().endsWith(e));

// acha o executavel como o Windows: em cada diretorio do PATH, .exe, depois .cmd, depois .bat
// (.ps1 e o nome sem extensao nunca rodam sem shell); fora do Windows o spawn resolve sozinho
export const resolverExecutavel = (exe, { plataforma = process.platform, env = process.env, existe = existsSync } = {}) => {
  if (plataforma !== 'win32') return { caminho: exe, tipo: 'exe' };
  const nomes = extensaoDe(exe) ? [exe] : EXTENSOES.map((e) => exe + e);
  const candidatos = /[\\/:]/.test(exe)
    ? nomes
    : (env.PATH ?? env.Path ?? '').split(';').map((d) => d.trim().replace(/^"|"$/g, '')).filter(Boolean).flatMap((d) => nomes.map((n) => path.win32.join(d, n)));
  const achado = candidatos.find(existe);
  return achado ? { caminho: achado, tipo: extensaoDe(achado) === '.exe' ? 'exe' : 'cmd' } : null;
};

// dentro das aspas o cmd.exe le ; & | < > ( como texto; ficam de fora o que ele ainda interpreta (% ^ !),
// a propria aspas e a barra invertida final (escapa a aspas de fechamento)
const inseguro = (x) => /["%^!]|[\u0000-\u001f\u007f]|\\$/.test(x);

export const comandoParaSpawn = ({ exe, args }, { resolvido, env = process.env }) => {
  if (!resolvido || resolvido.tipo === 'exe') return { exe: resolvido?.caminho ?? exe, args, opcoes: {} };
  const partes = [resolvido.caminho, ...args];
  for (const x of partes) if (inseguro(x)) throw new ErroExecutavel('ARGUMENTO_INSEGURO', `argumento inseguro para cmd.exe: ${JSON.stringify(x)}`);
  return {
    exe: env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', `"${partes.map((x) => `"${x}"`).join(' ')}"`],
    opcoes: { windowsVerbatimArguments: true },
  };
};
