export const montarComando = (contrato, { prompt } = {}) => {
  if (typeof prompt !== 'string' || !prompt) throw new Error('prompt vazio');
  // nunca --auto (D-266) nem --format json (nunca provado)
  return { exe: 'opencode', args: ['run', prompt, '--model', contrato.executor.modelo] };
};

// o stats e agregado do dia e o texto nao e lido: so os dois retratos brutos ficam guardados (o dispatch poe isto no meta)
export const TOKENS_STATS = { entrada: null, saida: null, raciocinio: null, cache_leitura: null, cache_criacao: null, total: null, fonte: 'opencode stats (texto bruto em opencode-stats-antes.txt e opencode-stats-depois.txt)' };

// forma esperada, nao falha: o relatorio vem de .agent/report.json [hipotese ate a rodada real do M3]
export const lerSaida = () => ({
  ok: false,
  relatorio: null,
  meta: { turnos: null, custo_usd: null, duracao_ms: null, sessao: null },
  erro: { codigo: 'RELATORIO_NO_ARQUIVO', mensagem: 'o opencode nao devolve relatorio estruturado no stdout; ler .agent/report.json' },
});
