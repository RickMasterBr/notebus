import * as claude from './claude.mjs';
import * as agy from './agy.mjs';
import * as opencode from './opencode.mjs';

const ADAPTADORES = new Map([['claude', claude], ['agy', agy], ['opencode', opencode]]);

export const adaptador = (harness) => {
  const a = ADAPTADORES.get(harness);
  if (!a) throw new Error(`harness desconhecido: ${harness}`);
  return { nome: harness, montarComando: a.montarComando, lerSaida: a.lerSaida };
};
