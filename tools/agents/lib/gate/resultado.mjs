export const SAIDA = { aprovado: 0, reprovado: 1, inconclusivo: 3 };

// puro: aprovado so com pelo menos uma verificacao ok e nenhuma falha nem nao_rodou
export const calcular = (verificacoes) => {
  const tem = (s) => verificacoes.some((v) => v.status === s);
  const resultado = tem('falha') ? 'reprovado' : tem('nao_rodou') || !tem('ok') ? 'inconclusivo' : 'aprovado';
  return {
    resultado,
    codigo: SAIDA[resultado],
    exige_revisor: verificacoes.some((v) => v.exigeRevisor === true),
    avisos: [...new Set(verificacoes.filter((v) => v.status === 'aviso').map((v) => v.codigo))],
  };
};

export const linha = ({ resultado, id, head, verificacoes }) => {
  const codigos = (s) => [...new Set(verificacoes.filter((v) => v.status === s).map((v) => v.codigo))].join(',');
  if (resultado === 'aprovado') return `APROVADO ${id} ${head.slice(0, 7)}`;
  return resultado === 'reprovado' ? `REPROVADO ${id} ${codigos('falha')}` : `INCONCLUSIVO ${id} ${codigos('nao_rodou')}`;
};
