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
    },
    // so o claude tem hook ligado; agy e opencode ficam para o bloco h2
    hook: contrato.executor?.harness === 'claude'
      ? { ligado: true, settings: dentro('hooks-claude.json') }
      : { ligado: false, motivo: 'harness sem hook ligado (h2)' },
  };
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

// ASCII e sem aspas duplas: o PowerShell 5.1 quebra os dois ao repassar argumentos
export const montarPrompt = (contrato) =>
  `Voce e o worker da tarefa ${contrato.id}. Leia .agent/contrato.md inteiro antes de comecar. ` +
  'Trabalhe so dentro da pasta atual. Siga os criterios e os limites do contrato. ' +
  'Use um comando por chamada de terminal, sem ; sem && sem |. ' +
  'No fim, entregue o relatorio no schema, com um item por criterio do contrato, e grave-o tambem em .agent/report.json.';
