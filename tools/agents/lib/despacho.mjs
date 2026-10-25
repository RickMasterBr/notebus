import path from 'node:path';

const PASTAS = ['', 'apps/mobile', 'packages/domain', 'tools/licenses', 'tools/mobilis-seed', 'tools/mvp-report'];

export const planejar = (contrato, { raiz, repo }) => {
  const id = contrato.id;
  const pista = { nome: contrato.pista, caminho: path.join(raiz, 'pistas', contrato.pista) };
  const despachoDir = path.join(raiz, '_despacho', id);
  const dentro = (nome) => path.join(despachoDir, nome);
  return {
    id,
    branch: `tarefa/${id}`,
    base: contrato.base.commit,
    pista,
    despachoDir,
    junctions: PASTAS.map((p) => ({
      de: path.join(repo, p, 'node_modules'),
      para: path.join(pista.caminho, p, 'node_modules'),
    })),
    arquivosDespacho: {
      autorizacao: dentro('autorizacao.json'),
      schema: dentro('relatorio.schema.json'),
      saida: dentro('saida.txt'),
      stderr: dentro('stderr.txt'),
      relatorio: dentro('relatorio.json'),
      meta: dentro('meta.json'),
      hooks: dentro('hooks-claude.json'),
      hookLog: dentro('hook.log'),
      hooksAgy: dentro('hooks-agy.json'),
      opencodeConfig: dentro('opencode-config.json'),
    },
    // claude: settings fora da pista; agy e opencode: arquivo na pista (o G03 o confere contra a copia do despacho)
    hook: hookDe(contrato.executor?.harness, pista.caminho, dentro),
  };
};

const hookDe = (harness, pista, dentro) => {
  if (harness === 'claude') return { ligado: true, tipo: 'claude', settings: dentro('hooks-claude.json') };
  if (harness === 'agy') return { ligado: true, tipo: 'agy', arquivoPista: path.join(pista, '.agents', 'hooks.json'), copia: dentro('hooks-agy.json') };
  if (harness === 'opencode') return { ligado: true, tipo: 'opencode', arquivoPista: path.join(pista, 'opencode.json'), copia: dentro('opencode-config.json') };
  return { ligado: false, motivo: 'harness sem hook ligado' };
};

const barra = (p) => p.replace(/\\/g, '/');

// o script do hook vem do repo, nunca da pista; caminhos com / e entre aspas (o shell do Claude Code os le)
export const montarHooksClaude = ({ repo, autorizacao, log }) => ({
  hooks: {
    PreToolUse: [
      {
        matcher: 'Edit|Write|MultiEdit|Bash',
        hooks: [{ type: 'command', command: `node "${barra(path.join(repo, 'tools/agents/hooks/protected-paths.mjs'))}" claude --autorizacao "${barra(autorizacao)}" --log "${barra(log)}"` }],
      },
    ],
  },
});

// formato da doc do Antigravity (confirmado na fumaca); matcher "*" porque o hook ja deixa passar o que nao cita caminho
// sem aspas: o agy divide o command em palavras e roda sem shell, aspas viram parte do argumento (o dispatch recusa caminho com espaco)
export const montarHooksAgy = ({ repo, autorizacao, log }) => ({
  'area-protegida': {
    PreToolUse: [
      {
        matcher: '*',
        hooks: [{ type: 'command', command: `node ${barra(path.join(repo, 'tools/agents/hooks/protected-paths.mjs'))} agy --autorizacao ${barra(autorizacao)} --log ${barra(log)}`, timeout: 10 }],
      },
    ],
  },
});

const glob = (e) => (e.endsWith('/') ? `${e}**` : e);
const cobre = (autorizadas, area) => autorizadas.some((a) => {
  const x = area.toLowerCase();
  const y = a.toLowerCase().replace(/\/+$/, '');
  return x.replace(/\/+$/, '') === y || x.startsWith(`${y}/`);
});

// a ultima regra que casa vence [hipotese: a fumaca confirma]; por isso os deny vem por ultimo
export const montarPermissoesOpencode = (contrato, { areas, controle }) => {
  // apagar antes de pôr: uma chave repetida manteria a posicao do allow
  const poe = (o, k, v) => {
    delete o[k];
    o[k] = v;
  };
  const autorizadas = contrato.areas_autorizadas ?? [];
  const edit = { '*': 'deny' };
  for (const e of [...contrato.arquivos_permitidos, '.agent/', ...autorizadas]) poe(edit, glob(e), 'allow');
  for (const e of areas.filter((a) => !cobre(autorizadas, a))) poe(edit, glob(e), 'deny');
  for (const e of controle) poe(edit, e === 'autorizacao.json' ? '**/autorizacao.json' : glob(e), 'deny');
  const bash = { '*': 'deny' };
  // o OpenCode nao casou o texto exato com a flag solta: libera tambem a flag entre aspas e o prefixo
  const variantes = (c) => {
    const m = /^npm run ([\w-]+)(?: |$)/.exec(c);
    if (!m) return [c];
    const aspas = c.split(' ').map((t) => (/^--[^=\s]+=\S+$/.test(t) ? `"${t}"` : t)).join(' ');
    return [c, aspas, `npm run ${m[1]}`, `npm run ${m[1]} *`];
  };
  for (const c of ['git status', 'git status *', 'git diff *', 'git log *', 'git add *', 'git commit *', 'git rev-parse *', 'git branch --show-current', ...(contrato.comandos_validacao ?? []).flatMap(variantes)]) poe(bash, c, 'allow');
  poe(bash, 'git push *', 'deny');
  return {
    $schema: 'https://opencode.ai/config.json',
    permission: {
      '*': 'deny',
      read: { '*': 'allow', '*.env': 'deny', '*.env.*': 'deny' },
      glob: 'allow',
      grep: 'allow',
      list: 'allow',
      edit,
      bash,
      skill: 'deny',
      webfetch: 'deny',
      external_directory: 'deny',
    },
  };
};

// ASCII e sem aspas duplas: o PowerShell 5.1 quebra os dois ao repassar argumentos
export const montarPrompt = (contrato) =>
  `Voce e o worker da tarefa ${contrato.id}. Leia .agent/contrato.md inteiro antes de comecar. ` +
  'Trabalhe so dentro da pasta atual. Siga os criterios e os limites do contrato. ' +
  'Use um comando por chamada de terminal, sem ; sem && sem |. ' +
  'No fim, entregue o relatorio no schema, com um item por criterio do contrato, e grave-o tambem em .agent/report.json.';
