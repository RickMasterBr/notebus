export const COLUNAS = [
  'tarefa', 'executor', 'modelo', 'inicio_despacho', 'fim_harness', 'inicio_gate', 'fim_gate',
  'duracao_harness_s', 'comandos_s', 'rodadas_verificacao', 'resultado_gate', 'exige_revisor',
  'avisos_gate', 'verificacoes_falhas', 'divergencias', 'arquivos_mudados', 'testes_novos',
  'resultado_relatorio', 'pct_limite', 'mutantes_sobreviventes', 'retrabalho', 'intervencoes_rick',
  'turnos', 'custo_usd', 'tokens_total',
];

export const escapar = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// fim de linha sempre "\n", em qualquer sistema
export const linha = (valores) => `${valores.map(escapar).join(',')}\n`;

export const CABECALHO = linha(COLUNAS);

// devolve { cabecalho: [..], linhas: [[..], ..] }; erro de aspas vira Error com code CSV_INVALIDO
export const ler = (texto) => {
  const t = texto.replace(/^﻿/, '');
  const registros = [];
  let campo = '';
  let atual = [];
  let aspas = false;
  let pendente = false; // ha algo na linha corrente (evita linha vazia fantasma no fim)
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"' && campo === '') { aspas = true; pendente = true; } else if (c === ',') { atual.push(campo); campo = ''; pendente = true; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      if (pendente || campo !== '') { atual.push(campo); registros.push(atual); }
      atual = []; campo = ''; pendente = false;
    } else { campo += c; pendente = true; }
  }
  if (aspas) throw Object.assign(new Error('aspas sem fechamento'), { code: 'CSV_INVALIDO' });
  if (pendente || campo !== '') { atual.push(campo); registros.push(atual); }
  const [cabecalho = [], ...linhas] = registros;
  return { cabecalho, linhas };
};
