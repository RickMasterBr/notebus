// Puro: sem fs nem processo. Quem le os arquivos e responde `existe` e o verificar-agents.mjs.
export const LIMITE_LINHAS = 100;
// citados no AGENTS.md por nome ou criados so durante a tarefa
const IGNORADOS = ['.agent/report.json', 'pt-BR.ts', 'schema.ts', 'backup.ts', 'stack.ts', 'StackedSheet.tsx', 'noDirectClock.test.ts'];
const PROIBIDOS = [/BOOT_START/, /escreva no di[aá]rio/i, /atualize o BOOT/i, /leia o estado/i, /estado_diario/];

const linhas = (t) => t.replace(/\r?\n$/, '').split(/\r?\n/);
const barra = (t) => t.replace(/\\/g, '/');

export const verificar = (textoAgents, textoClaude, { areas, existe }) => {
  const achados = [];
  const add = (regra, codigo, texto) => achados.push({ regra, codigo, texto });
  const ls = linhas(textoAgents);

  if (ls.length > LIMITE_LINHAS) add('V1', 'AGENTS_GRANDE', `${ls.length} linhas (limite ${LIMITE_LINHAS})`);

  const claude = textoClaude.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (claude.length !== 1 || claude[0] !== '@AGENTS.md') add('V2', 'CLAUDE_FORA_DO_PADRAO', 'o CLAUDE.md deve ter só a linha @AGENTS.md');

  for (const [, c] of textoAgents.matchAll(/`([^`\n]+)`/g)) {
    if (/[<>*{ $\\]/.test(c) || IGNORADOS.includes(c)) continue;
    if (/\/|\.(md|json|mjs|ts|tsx)$/.test(c) && !existe(c)) add('V3', 'CAMINHO_INEXISTENTE', c);
  }

  const texto = barra(textoAgents);
  for (const area of areas) {
    const a = barra(area);
    const chave = a.endsWith('/') ? a.slice(0, -1) : a.split('/').pop();
    if (!texto.includes(chave)) add('V4', 'AREA_FALTANDO', area);
  }

  const ini = ls.findIndex((l) => /^##\s+Regras de ouro/.test(l));
  const fim = ls.findIndex((l, i) => i > ini && /^##\s/.test(l));
  const nums = ini < 0 ? [] : ls.slice(ini + 1, fim < 0 ? undefined : fim).map((l) => /^(\d+)\.\s/.exec(l)).filter(Boolean).map((m) => Number(m[1]));
  if (!nums.length || nums.some((n, i) => n !== i + 1)) add('V5', 'REGRAS_FORA_DE_ORDEM', `numeração ${nums.join(',') || '(lista ausente)'}`);

  for (const l of ls) {
    if (/^\s*N[ãa]o leia/i.test(l)) continue;
    if (PROIBIDOS.some((p) => p.test(l))) add('V6', 'TEXTO_PROIBIDO', l.trim());
  }
  return achados;
};
