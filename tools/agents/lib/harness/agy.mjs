const SEM_META = { turnos: null, custo_usd: null, duracao_ms: null, sessao: null };
const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

export const montarComando = (_contrato, { prompt, schemaCaminho } = {}) => {
  if (typeof prompt !== 'string' || !prompt) throw new Error('prompt vazio');
  // caminho de arquivo, nunca texto: o PowerShell 5.1 quebra aspas e acentos
  if (typeof schemaCaminho !== 'string' || !schemaCaminho) throw new Error('schemaCaminho vazio');
  return { exe: 'agy', args: ['-p', prompt, '--mode', 'accept-edits', '--output-format', 'json', '--json-schema', schemaCaminho] };
};

// stdout redirecionado pelo PowerShell 5 vem com BOM
const semBom = (t) => { const s = String(t ?? ''); return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s; };

export const lerSaida = (texto) => {
  const falha = (codigo, mensagem, meta = SEM_META) => ({ ok: false, relatorio: null, meta, erro: { codigo, mensagem } });
  let saida;
  try {
    saida = JSON.parse(semBom(texto));
  } catch (e) {
    return falha('SAIDA_INVALIDA', e.message);
  }
  if (!ehObjeto(saida)) return falha('SAIDA_INVALIDA', 'a saida nao e um objeto JSON');
  const meta = { ...SEM_META, sessao: saida.conversation_id ?? null };
  if (saida.status !== 'SUCCESS') return falha('AGY_STATUS', String(saida.status), meta);
  let relatorio = null;
  try {
    if (typeof saida.response === 'string') relatorio = JSON.parse(saida.response);
  } catch {
    // response em texto livre: cai em SEM_RELATORIO
  }
  if (!ehObjeto(relatorio)) return falha('SEM_RELATORIO', 'response nao e o JSON do relatorio', meta);
  return { ok: true, relatorio, meta, erro: null };
};
