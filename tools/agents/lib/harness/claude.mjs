const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const inteiro = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const NULOS = { entrada: null, saida: null, raciocinio: null, cache_leitura: null, cache_criacao: null, total: null, fonte: 'claude usage' };
const SEM_META = { turnos: null, custo_usd: null, duracao_ms: null, sessao: null, tokens: NULOS };

// raciocinio ja esta dentro de saida: nao entra no total
const tokensDe = (u) => {
  if (!ehObjeto(u)) return NULOS;
  const t = { ...NULOS, entrada: inteiro(u.input_tokens), saida: inteiro(u.output_tokens), raciocinio: inteiro(ehObjeto(u.output_tokens_details) ? u.output_tokens_details.thinking_tokens : null), cache_leitura: inteiro(u.cache_read_input_tokens), cache_criacao: inteiro(u.cache_creation_input_tokens) };
  const parcelas = [t.entrada, t.saida, t.cache_leitura, t.cache_criacao];
  return { ...t, total: parcelas.every((n) => n !== null) ? parcelas.reduce((a, b) => a + b, 0) : null };
};
const textoValido = (v) => typeof v === 'string' && v.length > 0;
const PERMITIDAS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git add*)', 'Bash(git commit*)'];

// o claude -p nao conhece o meta-schema 2020-12 e recusa o $schema; texto que nao e objeto JSON com $schema passa como veio
const semMetaSchema = (texto) => {
  try {
    const obj = JSON.parse(texto);
    if (!ehObjeto(obj) || !('$schema' in obj)) return texto;
    const { $schema, ...resto } = obj;
    return JSON.stringify(resto);
  } catch {
    return texto;
  }
};

export const montarComando = (contrato, { prompt, schemaTexto, settingsCaminho } = {}) => {
  if (!textoValido(prompt)) throw new Error('prompt vazio');
  if (!textoValido(schemaTexto)) throw new Error('schemaTexto vazio');
  if (!contrato?.limites) throw new Error('contrato sem limites');
  const doContrato = contrato.comandos_validacao.filter((c) => !c.startsWith('git ')).map((c) => `Bash(${c}*)`);
  const permitidas = [...new Set([...PERMITIDAS, ...doContrato])];
  // --allowedTools engole o que vem depois: tem de ser a ultima
  return {
    exe: 'claude',
    args: ['-p', prompt, '--output-format', 'json', '--json-schema', semMetaSchema(schemaTexto), '--model', contrato.executor.modelo, '--max-turns', String(contrato.limites.turnos), ...(textoValido(settingsCaminho) ? ['--settings', settingsCaminho] : []), '--allowedTools', ...permitidas],
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
  const meta = { turnos: saida.num_turns ?? null, custo_usd: saida.total_cost_usd ?? null, duracao_ms: saida.duration_ms ?? null, sessao: saida.session_id ?? null, tokens: tokensDe(saida.usage) };
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
