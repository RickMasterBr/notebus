const ext = (p) => {
  const n = p.split('/').pop();
  const i = n.lastIndexOf('.');
  return i < 0 ? '' : n.slice(i).toLowerCase();
};

// a linha da tabela casa se algum caminho do diff bate no prefixo (ou na extensao, fora dos "exceto")
const casa = (linha, caminhos) =>
  caminhos.some((p) => (linha.prefixo !== undefined ? p.startsWith(linha.prefixo) : linha.extensoes.includes(ext(p)) && !(linha.exceto ?? []).some((x) => p.startsWith(x))));

// minimo na ordem da tabela, depois os do contrato; texto repetido fica com a primeira origem
export const selecionar = (arquivosMudados, tabela, comandosContrato) => {
  const vistos = new Set();
  const out = [];
  const poe = (comando, origem) => {
    if (vistos.has(comando)) return;
    vistos.add(comando);
    out.push({ comando, origem });
  };
  for (const linha of tabela) if (casa(linha, arquivosMudados)) linha.comandos.forEach((c) => poe(c, 'minimo'));
  comandosContrato.forEach((c) => poe(c, 'contrato'));
  return out;
};
