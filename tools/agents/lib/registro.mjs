// Funcoes puras: recebem o que o despacho e o gate deixaram, devolvem a linha do CSV e o texto do registro.
// gate = null quando nao ha gate.json. Campo ausente vira celula vazia, nunca erro.

const v = (x) => (x === undefined || x === null ? '' : x);
const juntar = (arr) => (Array.isArray(arr) ? arr.join('|') : '');

export const linhaDoDespacho = ({ contrato, meta, relatorio, gate, rodadas }) => {
  const soma = Object.values(relatorio.testes_novos_por_arquivo ?? {}).reduce((a, n) => a + n, 0);
  return [
    meta.id,
    v(meta.harness),
    v(contrato.executor?.modelo),
    v(meta.inicio),
    v(meta.fim),
    v(gate?.inicio),
    v(gate?.fim),
    v(meta.duracao_s),
    (relatorio.comandos ?? []).map((c) => c.duracao_s).join('|'),
    gate ? rodadas : 0,
    gate ? v(gate.resultado) : 'sem_gate',
    typeof gate?.exige_revisor === 'boolean' ? (gate.exige_revisor ? 'sim' : 'nao') : '',
    juntar(gate?.avisos),
    Array.isArray(gate?.verificacoes) ? gate.verificacoes.filter((x) => x.status === 'falha').map((x) => x.id).join('|') : '',
    Array.isArray(gate?.divergencias) ? gate.divergencias.length : '',
    (relatorio.arquivos_mudados ?? []).length,
    soma,
    v(relatorio.resultado),
    '', '', '', '',
    v(meta.meta?.turnos),
    v(meta.meta?.custo_usd),
    v(meta.meta?.tokens?.total),
  ];
};

// celula de tabela: barra e quebra de linha escapadas
const cel = (x) => String(v(x)).replace(/\|/g, '\\|').replace(/\r?\n|\r/g, '<br>');
// item de lista: so a quebra de linha vira espaco
const item = (x) => `- ${String(v(x)).replace(/\r?\n|\r/g, ' ')}`;
const tabela = (cab, linhas) => [`| ${cab.join(' | ')} |`, `|${cab.map(() => '---').join('|')}|`, ...linhas.map((l) => `| ${l.map(cel).join(' | ')} |`)].join('\n');
const lista = (arr, vazio = '_nenhum_') => (arr?.length ? arr.map(item).join('\n') : vazio);

export const esqueletoDoRegistro = ({ contrato, meta, relatorio, gate }) => {
  const naoOk = (gate?.verificacoes ?? []).filter((x) => x.status !== 'ok');
  const secaoGate = !gate ? 'sem gate' : naoOk.length ? tabela(['verificacao', 'status', 'codigo'], naoOk.map((x) => [x.id, x.status, x.codigo])) : '_todas as verificacoes ok_';
  return [
    `# Registro: ${String(meta.id).replace(/\r?\n|\r/g, ' ')}`,
    tabela(['campo', 'valor'], [
      ['tarefa', meta.id],
      ['executor', meta.harness],
      ['modelo', contrato.executor?.modelo],
      ['base', contrato.base?.commit],
      ['commit', relatorio.commit],
      ['branch', relatorio.branch],
      ['resultado do relatorio', relatorio.resultado],
      ['resultado do gate', gate ? gate.resultado : 'sem_gate'],
      ...[['turnos', meta.meta?.turnos], ['custo (USD)', meta.meta?.custo_usd], ['tokens', meta.meta?.tokens?.total]].filter(([, x]) => x !== undefined && x !== null),
    ]),
    '## Arquivos',
    `**arquivos_mudados**\n\n${lista(relatorio.arquivos_mudados)}\n\n**fora_do_pedido**\n\n${lista(relatorio.fora_do_pedido)}`,
    '## Comandos',
    tabela(['comando', 'duracao_s', 'codigo', 'resumo'], (relatorio.comandos ?? []).map((c) => [c.comando, c.duracao_s, c.codigo_saida, c.resumo])),
    '## Critérios',
    tabela(['criterio', 'status', 'evidencia'], (relatorio.itens ?? []).map((i) => [i.criterio, i.status, i.evidencia])),
    '## Dúvidas',
    lista(relatorio.duvidas),
    '## Ideias novas',
    lista(relatorio.ideias_novas),
    '## Gate',
    secaoGate,
    '## Veredito da coordenação',
    '_pendente_',
    '## Gasto informado',
    '_pendente_',
  ].join('\n\n') + '\n';
};
