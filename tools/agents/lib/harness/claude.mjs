const SEM_META = { turnos: null, custo_usd: null, duracao_ms: null, sessao: null };
const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const textoValido = (v) => typeof v === 'string' && v.length > 0;
const PERMITIDAS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git add*)', 'Bash(git commit*)'];

export const montarComando = (contrato, { prompt, schemaTexto } = {}) => {
  if (!textoValido(prompt)) throw new Error('prompt vazio');
  if (!textoValido(schemaTexto)) throw new Error('schemaTexto vazio');
  if (!contrato?.limites) throw new Error('contrato sem limites');
  const doContrato = contrato.comandos_validacao.filter((c) => !c.startsWith('git ')).map((c) => `Bash(${c}*)`);
  const permitidas = [...new Set([...PERMITIDAS, ...doContrato])];
  // --allowedTools engole o que vem depois: tem de ser a ultima
  return {
    exe: 'claude',
    args: ['-p', prompt, '--output-format', 'json', '--json-schema', schemaTexto, '--model', contrato.executor.modelo, '--max-turns', String(contrato.limites.turnos), '--allowedTools', ...permitidas],
  };
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
  const meta = { turnos: saida.num_turns ?? null, custo_usd: saida.total_cost_usd ?? null, duracao_ms: saida.duration_ms ?? null, sessao: saida.session_id ?? null };
  if (saida.is_error) return falha('CLAUDE_ERRO', [saida.subtype, saida.result].filter(textoValido).join(': '), meta);
  let relatorio = ehObjeto(saida.structured_output) ? saida.structured_output : null;
  if (!relatorio && typeof saida.result === 'string') {
    try {
      const r = JSON.parse(saida.result);
      if (ehObjeto(r)) relatorio = r;
    } catch {
      // result em texto livre: cai em SEM_RELATORIO
    }
  }
  if (!relatorio) return falha('SEM_RELATORIO', 'nem structured_output nem result trazem o relatorio', meta);
  return { ok: true, relatorio, meta, erro: null };
};
