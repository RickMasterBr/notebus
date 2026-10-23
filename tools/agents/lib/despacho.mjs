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
    },
  };
};

// ASCII e sem aspas duplas: o PowerShell 5.1 quebra os dois ao repassar argumentos
export const montarPrompt = (contrato) =>
  `Voce e o worker da tarefa ${contrato.id}. Leia .agent/contrato.md inteiro antes de comecar. ` +
  'Trabalhe so dentro da pasta atual. Siga os criterios e os limites do contrato. ' +
  'Use um comando por chamada de terminal, sem ; sem && sem |. ' +
  'No fim, entregue o relatorio no schema, com um item por criterio do contrato, e grave-o tambem em .agent/report.json.';
