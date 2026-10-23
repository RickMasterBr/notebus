import { readFileSync } from 'node:fs';
import { validar } from './schema.mjs';
import { lerJson } from './json.mjs';

export class ContratoErro extends Error {
  constructor(erros) {
    super(erros.map((e) => `${e.caminho} ${e.codigo} ${e.mensagem}`).join('; '));
    this.name = 'ContratoErro';
    this.erros = erros;
  }
}

const falha = (codigo, mensagem, caminho = '') => {
  throw new ContratoErro([{ codigo, caminho, mensagem }]);
};

const ABERTURA = /^```json contrato[ \t]*$/;
const FECHAMENTO = /^```[ \t]*$/;

export const extrairCabecalho = (texto) => {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const blocos = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!ABERTURA.test(linhas[i])) continue;
    const fim = linhas.findIndex((l, j) => j > i && FECHAMENTO.test(l));
    if (fim < 0) falha('BLOCO_ABERTO', `bloco aberto na linha ${i + 1} sem fechamento`);
    blocos.push({ linha: i + 1, json: linhas.slice(i + 1, fim).join('\n') });
    i = fim;
  }
  if (!blocos.length) falha('SEM_CABECALHO', 'nenhum bloco ```json contrato encontrado');
  if (blocos.length > 1) falha('CABECALHO_REPETIDO', `${blocos.length} blocos ${'```json contrato'} (linhas ${blocos.map((b) => b.linha).join(', ')})`);
  try {
    return { cabecalho: JSON.parse(blocos[0].json), linha: blocos[0].linha };
  } catch (e) {
    return falha('JSON_INVALIDO', e.message);
  }
};

const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
const semBarra = (s) => s.replace(/\/+$/, '');
// "dentro" segue a regra de pasta: igual, ou comeca com a entrada + '/'
const dentro = (rel, entrada) => rel === semBarra(entrada) || rel.startsWith(semBarra(entrada) + '/');

export const casa = (lista, rel) => {
  const r = norm(rel);
  return lista.some((e) => {
    const n = norm(e);
    return r === n || (n.endsWith('/') ? r.startsWith(n) : r.startsWith(n + '/'));
  });
};

const CAMINHOS = ['arquivos_permitidos', 'arquivos_de_outro_worker', 'areas_autorizadas'];
const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (x) => (Array.isArray(x) ? x : []);

const regras = (c) => {
  const erros = [];
  const add = (codigo, caminho, mensagem) => erros.push({ codigo, caminho, mensagem });
  for (const campo of CAMINHOS) {
    strings(c[campo]).forEach((p, i) => {
      if (typeof p !== 'string') return;
      const n = p.replace(/\\/g, '/');
      const onde = `/${campo}/${i}`;
      if (n.startsWith('/') || /^[a-z]:/i.test(n) || n.split('/').some((seg) => seg === '..' || /[. ]$/.test(seg)) || !n.replace(/\/+/g, '').trim()) {
        add('CAMINHO_INVALIDO', onde, `caminho invalido: ${p}`);
      } else if (n.toLowerCase().split('/')[0] === '.agent') {
        add('CAMINHO_RESERVADO', onde, `.agent e implicito, nao se lista: ${p}`);
      }
    });
  }
  const outros = strings(c.arquivos_de_outro_worker).filter((o) => typeof o === 'string').map(norm);
  strings(c.arquivos_permitidos).forEach((p, i) => {
    if (typeof p !== 'string') return;
    const a = norm(p);
    const o = outros.find((o) => dentro(a, o) || dentro(o, a));
    if (o !== undefined) add('LISTAS_SE_SOBREPOEM', `/arquivos_permitidos/${i}`, `${p} se sobrepoe a arquivos_de_outro_worker (${o})`);
  });
  const vistos = new Set();
  strings(c.criterios).forEach((k, i) => {
    if (typeof k !== 'string') return;
    if (vistos.has(k.trim())) add('CRITERIO_REPETIDO', `/criterios/${i}`, `criterio repetido: ${k.trim()}`);
    vistos.add(k.trim());
  });
  return erros;
};

export const lerContrato = (caminhoArquivo, { schemaPath }) => {
  const { cabecalho } = extrairCabecalho(readFileSync(caminhoArquivo, 'utf8'));
  const schema = lerJson(schemaPath);
  const doSchema = validar(schema, cabecalho).erros.map((e) => ({ codigo: 'SCHEMA', caminho: e.caminho, mensagem: `${e.codigo}: ${e.mensagem}` }));
  // regras() assume objeto; cabecalho de outro tipo so tem o erro do schema
  const erros = [...doSchema, ...(ehObjeto(cabecalho) ? regras(cabecalho) : [])];
  if (erros.length) throw new ContratoErro(erros);
  const ajusta = (l) => strings(l).map((p) => p.replace(/\\/g, '/'));
  return {
    ...cabecalho,
    arquivos_permitidos: ajusta(cabecalho.arquivos_permitidos),
    arquivos_de_outro_worker: ajusta(cabecalho.arquivos_de_outro_worker),
    areas_autorizadas: ajusta(cabecalho.areas_autorizadas),
    ideias: cabecalho.ideias ?? [],
  };
};
