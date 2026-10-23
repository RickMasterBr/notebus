import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// grava gate.json e uma copia igual em gate-historico/<inicio>.json (':' vira '-': nome valido no Windows)
export const gravar = (saida, gate) => {
  const texto = JSON.stringify(gate, null, 2);
  const hist = path.join(saida, 'gate-historico');
  mkdirSync(hist, { recursive: true });
  const nome = gate.inicio.replace(/:/g, '-');
  let alvo = path.join(hist, `${nome}.json`);
  for (let n = 2; existsSync(alvo); n++) alvo = path.join(hist, `${nome}-${n}.json`);
  writeFileSync(alvo, texto);
  writeFileSync(path.join(saida, 'gate.json'), texto);
  return alvo;
};
