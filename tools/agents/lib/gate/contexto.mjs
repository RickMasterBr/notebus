import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ContratoErro, extrairCabecalho, lerContrato } from '../contrato.mjs';
import { planejar } from '../despacho.mjs';
import { lerJson } from '../json.mjs';
import { git, parseZ, tenta } from '../git.mjs';

export class UsoErro extends Error {
  constructor(codigo, texto) {
    super(texto);
    this.codigo = codigo;
  }
}

const VALOR = ['--raiz', '--repo', '--schemas', '--config', '--areas', '--pista', '--relatorio', '--branch', '--base', '--saida'];
const BOOLEANA = ['--so-estatico', '--executar-sempre'];

export const lerArgs = (argv) => {
  const o = { flags: {}, contrato: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (BOOLEANA.includes(a)) o.flags[a] = true;
    else if (VALOR.includes(a)) {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new UsoErro('USO', `${a} pede um valor`);
      o.flags[a] = argv[++i];
    } else if (a.startsWith('--')) throw new UsoErro('USO', `flag desconhecida: ${a}`);
    else if (o.contrato === null) o.contrato = a;
    else throw new UsoErro('USO', `argumento a mais: ${a}`);
  }
  if (o.contrato === null) throw new UsoErro('USO', 'uso: gate.mjs <contrato.md> [flags]');
  const manual = ['--relatorio', '--branch', '--saida'];
  if ('--pista' in o.flags) {
    for (const f of manual) if (!(f in o.flags)) throw new UsoErro('USO', `--pista exige ${f}`);
  } else {
    for (const f of [...manual, '--base']) if (f in o.flags) throw new UsoErro('USO', `${f} so vale com --pista`);
  }
  return o;
};

const memo = (f) => {
  let pronto = false;
  let v;
  return () => {
    if (!pronto) {
      v = f();
      pronto = true;
    }
    return v;
  };
};

const sha = (dados) => createHash('sha256').update(dados).digest('hex');
const ZEROS = '0'.repeat(40);

// monta tudo que as verificacoes leem; so le o disco e o git, nunca escreve
export const montar = (argv, { gatePath }) => {
  const { flags, contrato: contratoArg } = lerArgs(argv);
  const gateReal = realpathSync.native(gatePath);
  const gateDir = path.dirname(gateReal);
  const padrao = (f, p) => path.resolve(f ?? p);
  const schemas = padrao(flags['--schemas'], path.join(gateDir, 'lib', 'fixtures'));
  const configPath = padrao(flags['--config'], path.join(gateDir, 'gate.config.json'));
  const areasPath = padrao(flags['--areas'], path.join(gateDir, 'hooks', 'protected-paths.json'));
  const contratoPath = path.resolve(contratoArg);
  for (const [rotulo, f] of [['contrato', contratoPath], ['config', configPath], ['areas', areasPath], ['schema do contrato', path.join(schemas, 'contrato.schema.json')], ['schema do relatorio', path.join(schemas, 'relatorio.schema.json')]]) {
    if (!existsSync(f)) throw new UsoErro('ARQUIVO_INEXISTENTE', `${rotulo} nao encontrado: ${f}`);
  }
  const config = lerJson(configPath);
  const areas = lerJson(areasPath);
  const bytes = readFileSync(contratoPath);

  let contrato = null;
  let contratoErros = null;
  let bruto = {};
  try {
    contrato = lerContrato(contratoPath, { schemaPath: path.join(schemas, 'contrato.schema.json') });
  } catch (e) {
    if (!(e instanceof ContratoErro)) throw e;
    contratoErros = e.erros.map((x) => `${x.caminho} ${x.codigo} ${x.mensagem}`);
    try {
      bruto = extrairCabecalho(bytes.toString('utf8')).cabecalho ?? {};
    } catch {}
  }

  const manual = '--pista' in flags;
  const raizBase = flags['--repo'] ? path.resolve(flags['--repo']) : process.cwd();
  const repo = raizBase;
  const raiz = padrao(flags['--raiz'], path.dirname(repo));
  if (!manual && !contrato) throw new UsoErro('CONTRATO_INVALIDO', `contrato invalido e sem --pista: ${contratoErros.join('; ')}`);

  const plano = contrato ? planejar(contrato, { raiz, repo }) : null;
  const pista = path.resolve(manual ? flags['--pista'] : plano.pista.caminho);
  if (!existsSync(pista)) throw new UsoErro('PISTA_INEXISTENTE', `pista nao encontrada: ${pista}`);
  const pistaGit = (args) => git(pista, args);
  const umaLinha = (args) => pistaGit(args).toString('utf8').trim();

  let head;
  try {
    head = umaLinha(['rev-parse', 'HEAD']);
  } catch (e) {
    throw new UsoErro('ERRO_GIT', `git na pista falhou: ${String(e.stderr ?? e.message).trim()}`);
  }
  const baseNome = flags['--base'] ?? contrato?.base.commit ?? bruto.base?.commit;
  let base = ZEROS;
  if (baseNome !== undefined) {
    const r = tenta(pista, ['rev-parse', '--verify', '--quiet', `${baseNome}^{commit}`]);
    if (r.ok) base = r.out.toString('utf8').trim();
    else if (contrato) throw new UsoErro('BASE_INEXISTENTE', `base nao existe na pista: ${baseNome}`);
  }

  const id = contrato?.id ?? (typeof bruto.id === 'string' ? bruto.id : '');
  const branch = manual ? flags['--branch'] : plano.branch;
  const relatorioPath = path.resolve(manual ? flags['--relatorio'] : plano.arquivosDespacho.relatorio);
  const saida = path.resolve(manual ? flags['--saida'] : plano.despachoDir);
  const metaPath = manual ? null : plano.arquivosDespacho.meta;
  let meta = null;
  if (metaPath && existsSync(metaPath)) {
    try {
      meta = lerJson(metaPath);
    } catch {}
  }
  // pastas node_modules relativas a raiz da pista (as 6 juncoes do despacho)
  const junctions = plano ? plano.junctions.map((j) => path.relative(plano.pista.caminho, j.para).replace(/\\/g, '/')) : [];

  const ctx = {
    modo: manual ? 'manual' : 'despacho',
    flags, gatePath: gateReal, gateDir, config, areas,
    schemaRelatorio: lerJson(path.join(schemas, 'relatorio.schema.json')),
    contratoPath, contratoSha: sha(bytes), contrato, contratoErros,
    id, branch, base, head, pista, repo, raiz, saida, relatorioPath, metaPath, meta, junctions,
    copiasHook: { '.agents/hooks.json': plano?.arquivosDespacho.hooksAgy ?? null, 'opencode.json': plano?.arquivosDespacho.opencodeConfig ?? null },
    achados: { fora_da_lista: [], areas_tocadas: [], controle_tocados: [] },
    git: pistaGit,
    tenta: (args) => tenta(pista, args),
    linha: umaLinha,
    relatorio: memo(() => {
      try {
        return { dados: lerJson(relatorioPath) };
      } catch (e) {
        return { erro: `${e.code ?? e.name}: ${e.message}` };
      }
    }),
    // diff entre a base e o HEAD sem deteccao de renomeacao: renomear aparece como D + A
    mudados: memo(() => {
      const t = parseZ(pistaGit(['diff', '--raw', '--no-renames', '-z', '--no-abbrev', base, head]));
      const out = [];
      for (let i = 0; i + 1 < t.length; i += 2) {
        const m = /^:(\d+) (\d+) \S+ \S+ ([A-Z])/.exec(t[i]);
        out.push({ caminho: t[i + 1], estado: m[3], modo: m[3] === 'D' ? m[1] : m[2] });
      }
      return out;
    }),
    numstat: memo(() => {
      const mapa = new Map();
      for (const l of parseZ(pistaGit(['diff', '--numstat', '--no-renames', '-z', base, head]))) {
        const [a, d, ...p] = l.split('\t');
        mapa.set(p.join('\t'), { add: a === '-' ? null : Number(a), del: d === '-' ? null : Number(d) });
      }
      return mapa;
    }),
  };
  return ctx;
};
