import { COLUNAS } from './csv.mjs';

const IDX = Object.fromEntries(COLUNAS.map((c, i) => [c, i]));
const DIA = 86400000;

// semana ISO 8601 em UTC: a quinta-feira da semana decide o ano
export const semanaIso = (iso) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const dia = (d.getUTCDay() + 6) % 7;
  const quinta = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + (3 - dia) * DIA;
  const ano = new Date(quinta).getUTCFullYear();
  const semana = Math.floor((quinta - Date.UTC(ano, 0, 1)) / DIA / 7) + 1;
  return `${ano}-W${String(semana).padStart(2, '0')}`;
};

export const SEMANA_VALIDA = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

const CABECALHO = ['semana', 'tarefas', 'aprovadas', 'reprovadas', 'inconclusivas', 'sem gate', 'harness medio (s)', 'gate total (s)', 'pct_limite', 'retrabalho', 'mutantes', 'intervencoes', 'com falhas'];
const arred = (n) => String(Math.round(n * 10) / 10);

// linhas: matrizes de 22 colunas. Devolve { texto, avisos: [{codigo, mensagem}] }
export const resumir = (linhas, { semana } = {}) => {
  const avisos = [];
  const grupos = new Map();
  for (const l of linhas) {
    const s = semanaIso(l[IDX.inicio_despacho]);
    if (!s) { avisos.push({ codigo: 'CELULA_ILEGIVEL', mensagem: `${l[IDX.tarefa]} inicio_despacho` }); continue; }
    if (semana && s !== semana) continue;
    if (!grupos.has(s)) grupos.set(s, []);
    grupos.get(s).push(l);
  }

  // soma so as celulas preenchidas; texto nao inteiro vira aviso e fica fora
  const somar = (ls, col) => {
    let total = 0;
    let achou = false;
    for (const l of ls) {
      const c = l[IDX[col]];
      if (c === '') continue;
      if (!/^\d+$/.test(c)) { avisos.push({ codigo: 'CELULA_ILEGIVEL', mensagem: `${l[IDX.tarefa]} ${col}: ${c}` }); continue; }
      total += Number(c);
      achou = true;
    }
    return achou ? String(total) : 'n/p';
  };

  const linhasTabela = [...grupos.keys()].sort().reverse().map((s) => {
    const ls = grupos.get(s);
    const conta = (r) => ls.filter((l) => l[IDX.resultado_gate] === r).length;
    const harness = ls.map((l) => l[IDX.duracao_harness_s]).filter((c) => c !== '' && Number.isFinite(Number(c))).map(Number);
    const gate = ls.reduce((a, l) => {
      const dur = (Date.parse(l[IDX.fim_gate]) - Date.parse(l[IDX.inicio_gate])) / 1000;
      return Number.isFinite(dur) ? a + dur : a;
    }, 0);
    const falhas = ls.filter((l) => l[IDX.verificacoes_falhas] !== '').map((l) => l[IDX.tarefa]);
    return [s, ls.length, conta('aprovado'), conta('reprovado'), conta('inconclusivo'), conta('sem_gate'),
      harness.length ? arred(harness.reduce((a, n) => a + n, 0) / harness.length) : 'n/p', arred(gate),
      somar(ls, 'pct_limite'), somar(ls, 'retrabalho'), somar(ls, 'mutantes_sobreviventes'), somar(ls, 'intervencoes_rick'),
      falhas.length ? falhas.join(', ') : '-'];
  });

  const total = [...grupos.values()].reduce((a, ls) => a + ls.length, 0);
  const tabela = [`| ${CABECALHO.join(' | ')} |`, `|${CABECALHO.map(() => '---').join('|')}|`, ...linhasTabela.map((l) => `| ${l.join(' | ')} |`)].join('\n');
  return { texto: `# Resumo semanal\n\n${tabela}\n\n${total} tarefas\n`, avisos };
};
