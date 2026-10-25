// D-320: suite do app sob paralelismo total estoura o prazo fixo de 5 s do vitest
const MAX_WORKERS_APP = 2;
const TEST_TIMEOUT_APP_MS = 20000;

const erro = (msg) => Object.assign(new Error(msg), { codigo: 'RESULTADO_ILEGIVEL' });

// (?<![\w.$]) deixa de fora regex.test(x) e obj.it(x)
const CHAMADA = /(?<![\w.$])(?:it|test)(?:\.each)?\s*\(/g;
const PULADA = /(?<![\w.$])(?:(?:it|test)\.(?:skip|only|todo)|xit|xtest)\s*\(/g;
const semComentario = (texto) => texto.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
const conta = (texto, re) => (semComentario(texto).match(re) ?? []).length;

export const contarChamadas = (texto) => conta(texto, CHAMADA);
export const contarPuladas = (texto) => conta(texto, PULADA);

// listas { arquivo: n }; arquivo ausente na base conta tudo; so diferenca positiva
export const novosPorArquivo = (listaBase, listaHead) => {
  const out = {};
  for (const [arquivo, n] of Object.entries(listaHead)) {
    const d = n - (listaBase[arquivo] ?? 0);
    if (d > 0) out[arquivo] = d;
  }
  return out;
};

const inteiro = (v) => Number.isInteger(v) && v >= 0;

// reporter json do Vitest; pulou = skipped + todo; arquivos_pulados = arquivos com teste pulado
export const lerVitest = (json, pacote) => {
  const r = typeof json === 'string' ? (() => { try { return JSON.parse(json); } catch { throw erro('JSON do vitest ilegivel'); } })() : json;
  const campos = ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests'];
  if (!r || typeof r !== 'object' || !campos.every((c) => inteiro(r[c])) || !Array.isArray(r.testResults)) throw erro('JSON do vitest sem os campos num*Tests');
  const arquivos_pulados = r.testResults.filter((f) => (f.assertionResults ?? []).some((a) => a.status === 'skipped' || a.status === 'todo' || a.status === 'pending')).map((f) => f.name);
  return { ...(pacote ? { pacote } : {}), total: r.numTotalTests, passou: r.numPassedTests, falhou: r.numFailedTests, pulou: r.numPendingTests + r.numTodoTests, arquivos_pulados };
};

// resumo do node --test --test-reporter=tap
export const lerTap = (texto) => {
  const n = (nome) => {
    const m = new RegExp(`^# ${nome} (\\d+)\\s*$`, 'm').exec(texto);
    return m ? Number(m[1]) : null;
  };
  const total = n('tests');
  if (total === null || n('pass') === null || n('fail') === null) throw erro('resumo TAP sem # tests/# pass/# fail');
  return { total, passou: n('pass'), falhou: n('fail'), pulou: (n('skipped') ?? 0) + (n('todo') ?? 0) };
};

// o gate pede a contagem ao proprio comando: TAP no node --test, json no vitest dos dois pacotes conhecidos
// (outro pacote pode nao ser vitest: nao se injeta flag as cegas). O texto gravado no gate.json continua o original.
export const comContagem = (comando, arquivoVitest) => {
  const c = comando.trim();
  if (/^node\s+--test\b/.test(c) && !c.includes('--test-reporter')) {
    return { executar: c.replace(/^node\s+--test\b/, 'node --test --test-reporter=tap'), leitor: 'tap', pacote: c };
  }
  const m = /^npm test -w (packages\/domain|apps\/mobile)$/.exec(c);
  if (m) {
    const folga = m[1] === 'apps/mobile' ? ` --maxWorkers=${MAX_WORKERS_APP} --testTimeout=${TEST_TIMEOUT_APP_MS}` : '';
    return { executar: `${c} -- --reporter=json --outputFile=${arquivoVitest}${folga}`, leitor: 'vitest', pacote: m[1] };
  }
  return { executar: comando, leitor: null, pacote: c };
};
