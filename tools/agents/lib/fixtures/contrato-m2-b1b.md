# Contrato: `m2-b1b-ajustes-schema` · Corrigir os 5 defeitos que a conferência achou no b1

> Bloco (b1b) do M2. Corrige o que a coordenação achou ao conferir o `m2-b1-contrato-schema` (commit `7990a63`, 27 testes, as 6 mutações do C11 foram pegas). Modelo: `v1/infra/modelos/contrato-de-tarefa.md`. **Quem escreve:** a coordenação. **Quem aprova:** o Rick. O worker não edita este contrato.
> **Os defeitos, com a reprodução da coordenação (S-241):** (1) `required: ["toString"]` passa em `{}`, `{"__proto__":1}` passa com `additionalProperties: false` e `{"constructor":1}` lança `SchemaNaoSuportado` em vez de `additional`: o código usa `in`, que olha a cadeia de protótipos. `type: "toString"` é aceito e valida qualquer coisa; o CLI com `toString` como tipo termina com `TypeError` e código 1 (o código 1 significa "erros de validação"). (2) Argumento inválido de palavra suportada passa em silêncio: `enum: "abc"` aceita qualquer substring de `abc`; `pattern: "("` só lança se o valor for string. (3) Cabeçalho `null` faz `lerContrato` lançar `TypeError` em vez de `ContratoErro`, porque `regras()` roda antes do schema. (4) `./apps/`, `.` e `apps./x` passam em `CAMINHO_INVALIDO` mas nunca casam em `casa` (o Windows ignora ponto e espaço no fim do nome; `./.agent/x` escapa de `CAMINHO_RESERVADO`). (5) JSON com BOM (o `Out-File` do PowerShell 5 grava BOM) derruba o `relatorio` e o `--schema` com código 2; só o contrato trata BOM.

```json contrato
{
  "id": "m2-b1b-ajustes-schema",
  "modo": "agente normal",
  "executor": { "harness": "claude", "modelo": "sonnet" },
  "base": { "branch": "infra/m2", "commit": "7990a63" },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools/agents/lib/",
    "tools/agents/validar.mjs",
    "tools/agents/validar.test.mjs"
  ],
  "comandos_validacao": [
    "node --test tools/agents/lib/schema.test.mjs tools/agents/lib/contrato.test.mjs tools/agents/lib/json.test.mjs tools/agents/validar.test.mjs",
    "git status --short",
    "git diff --name-only 7990a63"
  ],
  "limites": { "turnos": 30, "minutos": 20 },
  "criterios": [
    "D1 schema: required, properties e type so olham chaves proprias",
    "D2 schema: argumento invalido de palavra suportada lanca",
    "D3 contrato: cabecalho que nao e objeto da ContratoErro",
    "D4 caminho: segmento ponto ou terminado em ponto ou espaco e invalido",
    "D5 CLI: tipo inexistente da codigo 2 e BOM e aceito",
    "D6 os 27 testes antigos passam sem troca",
    "D7 este contrato e valido",
    "D8 nada fora da lista, mutacoes"
  ],
  "ideias": [116]
}
```

**Linha de aviso (instruções do Projeto):** Modo agente normal · Executor Claude Code local (Sonnet, `claude` dentro da pista) · Por que 5 correções pequenas em 3 módulos já existentes, todas com caso de reprodução, sem frentes paralelas · Custo estimado 2 a 3% do limite de 5 h [hipótese; o b1 gastou 3%, o Rick anota o real, D-269]

## 1. Objetivo (observável, uma frase)
O validador de schema só olha chaves próprias, recusa argumento inválido de palavra, o leitor de contrato nunca lança `TypeError` para cabeçalho estranho, caminho com segmento `.` ou terminado em ponto/espaço é inválido, e o CLI recusa tipo inexistente com código 2 e lê JSON com BOM.

## 2. Não fazer
- Não adicionar dependência nem `package.json` em `tools/agents/` (D-254). Não tocar o hook, não escrever `dispatch`, `gate` ou adaptador.
- Não mudar a API pública (`validar`, `SchemaNaoSuportado`, `extrairCabecalho`, `lerContrato`, `casa`, `ContratoErro`, formato de saída do CLI, códigos de saída 0/1/2) nem o comportamento de nenhum teste existente. **Trocas permitidas nos 27 testes antigos: nenhuma.** Se um cair, pare e relate.
- Não suportar palavra nova de schema. Não mexer nos dois schemas de `fixtures/` (continuam idênticos aos de `docs`; mostre os 2 hashes).
- Não tratar aqui, **de propósito**: chaves duplicadas no JSON do cabeçalho (a última vence); cerca de 4 crases (dá `SEM_CABECALHO`, falha fechada); `casa` com `..` no caminho a testar (o `gate` recebe caminhos do `git diff`); nome curto 8.3. Entram como limites conhecidos no relatório (`duvidas`), não no código.
- Sem push, tag, workflow `ios`; não tocar `main` nem `e09`; não commitar `.agent/`; não escrever `.md` em `docs/`.

## 3. Contexto (leia só isto)
Este contrato; `tools/agents/lib/schema.mjs`, `contrato.mjs`, `validar.mjs` e os testes; `docs\v1\contratos\m2-b1-contrato-schema.md` §3 (contratos de API, valem como estão).

**Regras (decididas aqui):**
- **R1, chaves próprias.** Em `schema.mjs`, toda consulta "a chave existe" usa `Object.hasOwn`: `required` contra o valor, `properties` contra o valor, `type` contra a tabela de tipos. Em `validar.mjs`, o tipo do comando também (`Object.hasOwn(PADRAO, tipo)`).
- **R2, argumento das palavras.** `conferirSchema` valida o argumento de cada palavra do nó, e lança `SchemaNaoSuportado` com o **nome da palavra** e o caminho dentro do schema: `type` texto e chave própria da tabela; `required` lista de strings; `properties` objeto cujos valores são objetos; `additionalProperties` boolean ou objeto; `items` objeto; `enum` lista **não vazia** de primitivos (string, número, boolean, null); `const` primitivo; `pattern` string que **compila** (compile na conferência, mesmo que o valor não seja string); `minLength`, `maxLength`, `minItems`, `maxItems` inteiro `>= 0`; `minimum`, `maximum` número finito. A conferência roda no nó visitado, como hoje.
- **R3, cabeçalho não objeto.** `lerContrato` só chama `regras()` se o cabeçalho é objeto; senão o erro do schema (`SCHEMA`, `type`, caminho `''`) é o único erro. Nunca `TypeError`.
- **R4, caminho.** Em `regras()`, `CAMINHO_INVALIDO` também quando **algum segmento** (separado por `/` depois de normalizar `\`) é `.`, ou termina em `.` ou em espaço (`..` já era). Isso cobre `./apps/`, `.`, `apps/./x`, `apps./x`, `apps /x`, `a/b.`. Continua válido: `.github/`, `a.b/c.ts`, `apps/mobile/`, `README.md`. A ordem das checagens não muda: `.agent` e `.agent/x` seguem `CAMINHO_RESERVADO`; `./.agent/x` agora é `CAMINHO_INVALIDO`.
- **R5, JSON com BOM.** Novo `tools/agents/lib/json.mjs` com `export const lerJson = (caminho) => JSON.parse(texto sem BOM)` (UTF-8; remove um `U+FEFF` inicial; erro de parse sobe como está). `validar.mjs` e `contrato.mjs` passam a ler **todo** JSON por ele (relatório, schema do `--schema`, schema do `lerContrato`).

## 4. Base
Worktree `..\notebus-infra`, branch `infra/m2`, topo `7990a63`. Prova de base: `git branch --show-current` = `infra/m2`; `git rev-parse --short HEAD` = `7990a63`; `git status --short` mostra no máximo `.agent/`. Antes de começar: `Rename-Item .agent\report.json report-m2-b1.json`. Divergência: pare e avise.

## 5. Arquivos
- **Permitidos (lista fechada):** `tools/agents/lib/schema.mjs`, `contrato.mjs` (editar); `tools/agents/lib/json.mjs` e `json.test.mjs` (novos); `tools/agents/lib/schema.test.mjs`, `contrato.test.mjs` (só acrescentar testes); `tools/agents/lib/fixtures/` (acrescentar; `contrato-m2-b1b.md` = cópia **sem alteração** deste contrato; mais os JSON/MD que os testes novos precisarem); `tools/agents/validar.mjs` (editar); `tools/agents/validar.test.mjs` (só acrescentar); `.agent/report.json` (não rastreado).
- **De outro worker / áreas protegidas:** nenhum.

## 6. Dependências
`m2-b1-contrato-schema` concluído (`7990a63`).

## 7. Comandos de validação (uma rodada, cronometrada)
Os do cabeçalho, nesta ordem, cada um com a duração em `comandos[]`. Depois do commit, `git diff --name-only 7990a63` lista só arquivos do §5.

## 8. Limites
No máximo **30 turnos** e **20 minutos**; ao chegar, pare e relate. Pare e pergunte também se: um dos 27 testes antigos cair; um dos dois schemas de `fixtures/` precisar mudar; R2 recusar o próprio `contrato.schema.json` ou `relatorio.schema.json` (a coordenação conferiu que usam só `type`, `required`, `properties`, `additionalProperties`, `items`, `minItems`, `minLength`, `minimum`, `maximum`, `pattern`, `enum`, anotações; confirme com o teste D2).

## 9. Ideias da etapa (D-234)
**116** (cabeçalho JSON no contrato): continua dentro. **76/81** (gate): fora, é o bloco (c). **86** e **87**: fora.

## 10. Formato de entrega
Relatório em `.agent/report.json` conforme `relatorio.schema.json`, `tarefa` = `m2-b1b-ajustes-schema`; **um item por critério do cabeçalho** (`criterio` = o texto do cabeçalho). Prosa só em `duvidas` (inclua os limites conhecidos do §2 e os 2 hashes). Um commit em `infra/m2`: `infra(m2-b1b): schema so com chaves proprias, argumentos validados, caminho e BOM`. Sem push. Sem percentual de gasto. Ao fim, rode `node tools/agents/validar.mjs relatorio .agent/report.json --schema tools/agents/lib/fixtures/relatorio.schema.json` e cole o resultado.

## 11. Critérios de aceitação (repetidos aqui, no fim, de propósito)
Todos por `node --test`, código de saída 0, um teste mínimo por linha, nome do teste começa com o id do critério:

1. **D1:** `validar({type:'object',required:['toString']}, {})` dá `required:/toString`; com `additionalProperties:false` e `properties:{a:{}}`, o valor `JSON.parse('{"constructor":1}')` dá `additional:/constructor` e `JSON.parse('{"__proto__":1}')` dá `additional:/__proto__`; `{type:'toString'}` e `{type:'constructor'}` lançam `SchemaNaoSuportado` com `palavra` = `type`; `{type:'object',properties:{a:{type:'string'}}}` com `{a:1}` continua dando `type:/a`.
2. **D2:** lançam `SchemaNaoSuportado` com a palavra certa: `enum:'abc'`, `enum:[]`, `enum:[{}]`, `const:{}`, `required:'abc'`, `required:[1]`, `properties:[]`, `additionalProperties:'x'`, `items:[]`, `pattern:5`, `pattern:'('` **com valor numérico `5`**, `minLength:'5'`, `maxLength:-1`, `minItems:1.5`, `maxItems:'2'`, `minimum:'1'`, `maximum:Infinity`. Passam: `enum:['a',1,true,null]`, `const:null`, `minLength:0`, as anotações, e os dois schemas reais de `fixtures/` validando o `relatorio-valido.json` e o contrato válido como antes.
3. **D3:** `lerContrato` sobre arquivo com cabeçalho `null`, `5`, `"x"`, `[]`, `true` lança **`ContratoErro`** (nunca `TypeError`) com exatamente um erro `SCHEMA` de caminho `''` e `mensagem` começando por `type`.
4. **D4:** `CAMINHO_INVALIDO` para `./apps/`, `.`, `apps/./x`, `apps./x`, `apps /x`, `a/b.` e `./.agent/x`; **sem erro** para `.github/`, `a.b/c.ts`, `apps/mobile/`, `README.md`; `.agent` e `.agent/x` continuam `CAMINHO_RESERVADO`; contrato com dois problemas ainda devolve os dois.
5. **D5 (CLI, por `child_process`):** `toString`, `constructor`, `__proto__` e `hasOwnProperty` como tipo dão código **2**, mensagem `argumentos invalidos` e `stderr` sem `TypeError`; `relatorio` válido gravado com `﻿` na frente dá `OK` e 0; `--schema` com BOM dá `OK`; `contrato` válido com schema com BOM dá `OK`. `json.test.mjs`: `lerJson` com e sem BOM, e erro de parse sobe com a mensagem do `JSON.parse`.
6. **D6:** os 27 testes antigos passam **sem nenhuma troca** (`git diff` mostra só linhas acrescentadas nos arquivos `.test.mjs` antigos).
7. **D7:** `lerContrato` sobre `fixtures/contrato-m2-b1b.md` (cópia sem alteração deste arquivo) com o `contrato.schema.json` devolve id `m2-b1b-ajustes-schema`, 3 arquivos permitidos e 8 critérios.
8. **D8:** `git diff --name-only 7990a63` só tem arquivos do §5; `fora_do_pedido` vazio; nenhum push. **Mutações (a coordenação confere):** para cada uma, o teste falha e a primeira linha da falha está **copiada da saída do `node --test`**, depois restaure: (i) `Object.hasOwn` trocado por `in` no `required`; (ii) `type` aceito por `in` na tabela; (iii) `regras()` chamada sem o guarda de objeto; (iv) segmento `.` aceito em `regras()`; (v) `lerJson` sem remover o BOM.

*Repetição do objetivo (§1) e do "não fazer" (§2) em uma linha cada:* **Objetivo:** schema só com chaves próprias e argumentos validados, `lerContrato` sem `TypeError`, caminho sem `.`/ponto/espaço no fim, CLI com tipo inexistente em 2 e BOM aceito. · **Não fazer:** dependência, mexer em teste antigo, mudar API pública, tratar os limites do §2, tocar hook/`dispatch`/`gate`.
