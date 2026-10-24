import { existsSync, lstatSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs';

// Remove so o link. Nunca recursive: se o caminho for uma juncao, o alvo (o node_modules real) tem que sobreviver.
export const removerJuncao = (caminho) => {
  let st;
  try {
    st = lstatSync(caminho);
  } catch {
    return { removida: false, motivo: 'NAO_EXISTE' };
  }
  if (!st.isSymbolicLink()) return { removida: false, motivo: 'NAO_E_LINK' };
  let alvo = null;
  try {
    alvo = realpathSync(caminho);
  } catch {
    // link quebrado: remove o link e alvoIntacto fica false
  }
  try {
    unlinkSync(caminho);
  } catch {
    // juncao do Windows: o rmdir sem recursive tira o link e deixa o alvo
    rmdirSync(caminho);
  }
  return { removida: true, alvoIntacto: alvo !== null && existsSync(alvo) };
};
