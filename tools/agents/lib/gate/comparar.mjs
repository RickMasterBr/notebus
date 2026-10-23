const conjunto = (l) => new Set(Array.isArray(l) ? l : []);
const igual = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const lista = (s) => [...s].sort();

// G10: o relatorio descreve o mesmo estado que o gate viu. Conjuntos comparados como conjunto; duracao_s nunca entra.
export const compararRelatorio = ({ relatorio, gateArquivos, gateForaDaLista, comandosExecutados, comandosContrato }) => {
  const falhas = [];
  const avisos = [];
  const divergencias = [];
  for (const [campo, doGate] of [['arquivos_mudados', gateArquivos], ['fora_do_pedido', gateForaDaLista]]) {
    const r = conjunto(relatorio[campo]);
    const g = conjunto(doGate);
    if (igual(r, g)) continue;
    falhas.push({ codigo: 'RELATORIO_OUTRO_ESTADO', mensagem: `${campo} do relatorio difere do que o gate viu` });
    divergencias.push({ campo, relatorio: lista(r), gate: lista(g), efeito: 'falha' });
  }
  const relatados = Array.isArray(relatorio.comandos) ? relatorio.comandos : [];
  for (const comando of comandosContrato) {
    const doRel = relatados.find((c) => c.comando === comando);
    const doGate = comandosExecutados.find((c) => c.comando === comando);
    if (!doRel) {
      avisos.push({ codigo: 'COMANDO_NAO_RELATADO', mensagem: `o relatorio nao traz: ${comando}` });
      continue;
    }
    // sem codigo do gate (tempo, ferramenta) nao ha o que comparar
    if (!doGate || typeof doGate.codigo_saida !== 'number') continue;
    if (doRel.codigo_saida === 0 && doGate.codigo_saida !== 0) {
      falhas.push({ codigo: 'RELATORIO_ESCONDE_FALHA', mensagem: `relatorio diz 0, o gate viu ${doGate.codigo_saida}: ${comando}` });
      divergencias.push({ campo: `comandos[${comando}].codigo_saida`, relatorio: 0, gate: doGate.codigo_saida, efeito: 'falha' });
    } else if (doRel.codigo_saida !== 0 && doGate.codigo_saida === 0) {
      avisos.push({ codigo: 'RELATORIO_DIZ_FALHA', mensagem: `relatorio diz ${doRel.codigo_saida}, o gate viu 0: ${comando}` });
      divergencias.push({ campo: `comandos[${comando}].codigo_saida`, relatorio: doRel.codigo_saida, gate: 0, efeito: 'aviso' });
    }
  }
  return { falhas, divergencias, avisos };
};
