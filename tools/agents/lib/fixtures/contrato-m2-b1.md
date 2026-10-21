# Contrato: `m2-b1-contrato-schema` · Cabeçalho do contrato e validador de schema (base do `dispatch` e do `gate`)

> Bloco (b1) do M2 (roadmap §10.3, ideia 116, D-281, D-283). Primeiro contrato com cabeçalho lido por máquina; o cabeçalho abaixo é validado pelo código que este contrato manda escrever. **Quem escreve:** a coordenação. **Quem aprova:** o Rick. O worker não edita este contrato.
> Contexto da divisão em b1, b2 e b3: o `dispatch` (b3) e o `gate` (bloco c) precisam ler o contrato e validar o relatório. Escrever isso uma vez, aqui, evita que os dois tenham leitores diferentes.

```json contrato
{
  "id": "m2-b1-contrato-schema",
  "modo": "agente normal",
  "executor": { "harness": "claude", "modelo": "sonnet" },
  "base": { "branch": "infra/m2", "commit": "e3be0a8" },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools/agents/lib/",
    "tools/agents/validar.mjs",
    "tools/agents/validar.test.mjs"
  ],
  "comandos_validacao": [
    "node --test tools/agents/lib/schema.test.mjs tools/agents/lib/contrato.test.mjs tools/agents/validar.test.mjs",
    "git status --short",
    "git diff --name-only e3be0a8"
  ],
  "limites": { "turnos": 30, "minutos": 25 },
  "criterios": [
    "C1 schema: tipos e obrigatorios",
    "C2 schema: objetos, listas, strings e numeros",
    "C3 schema: palavra nao suportada falha fechada",
    "C4 relatorio real valida e mutacoes caem",
    "C5 cabecalho: extracao",
    "C6 cabecalho: validacao pelo schema",
    "C7 cabecalho: regras entre campos",
    "C8 casa e normalizacao de caminhos",
    "C9 CLI validar",
    "C10 este contrato e valido",
    "C11 nada fora da lista, mutacoes"
  ],
  "ideias": [116]
}
```

**Linha de aviso (instruções do Projeto):** Modo agente normal · Executor Claude Code local (Sonnet, `claude` dentro da pista) · Por que 2 módulos puros e 1 CLI pequeno, tudo especificado com casos, sem frentes paralelas · Custo estimado 3 a 4% do limite de 5 h [hipótese; o Rick anota o real, D-269]

## 1. Objetivo (observável, uma frase)
Existem `tools/agents/lib/schema.mjs` (validador mínimo de JSON Schema que falha fechado) e `tools/agents/lib/contrato.mjs` (extrai e valida o cabeçalho de um contrato), mais o CLI `tools/agents/validar.mjs`, e `node --test` prova cada regra, inclusive que **este contrato** é válido.

## 2. Não fazer
- Não adicionar dependência (nem `ajv`), não criar `package.json` em `tools/agents/` (Node puro, D-254).
- Não escrever `dispatch`, `gate`, adaptador de harness, nem tocar o hook (`tools/agents/hooks/`).
- Não editar nenhum arquivo existente do repositório. Não copiar nem editar os schemas de `docs/`: **leia** de `docs\v1\infra\modelos\` e copie **sem alterar** para `fixtures/` (item 5).
- Não suportar palavra de JSON Schema fora da lista do §3: palavra desconhecida **lança erro**, não é ignorada (falha fechada).
- Não afrouxar uma regra para um teste passar. Se um critério exigir mudar o valor esperado: pare e relate.
- Sem push, tag, workflow `ios`; não tocar `main` nem `e09`; não commitar `.agent/`; não escrever `.md` em `docs/`.

## 3. Contexto (leia só isto)
1. Este contrato inteiro.
2. `docs\v1\infra\modelos\contrato.schema.json` e `relatorio.schema.json` (os dois schemas que o código valida) e `contrato-de-tarefa.md` (seção "Cabeçalho").
3. `tools/agents/hooks/protected-paths.mjs`: só para seguir o mesmo estilo de módulo ESM e a mesma semântica de "pasta termina em `/`". **Não importe nada dele.**

**`schema.mjs`: contrato de API (decidido aqui).**
`export const validar = (schema, valor) => ({ ok, erros })`, `erros` = lista de `{ caminho, codigo, mensagem }`. `caminho` no estilo `/itens/0/status` (raiz = `''`). Coleta **todos** os erros, não só o primeiro.
Palavras suportadas e `codigo` do erro:
- `type` (só texto, um tipo): `object` (não nulo, não lista), `array`, `string`, `number` (finito), `integer` (`Number.isInteger`), `boolean`, `null`. Erro `type`; se o tipo falha, não valida mais nada naquele valor.
- `required`: erro `required`, `caminho` = pai + `/chave` ausente.
- `properties` e `additionalProperties` (`false`, `true` ou schema): chave a mais com `false` = erro `additional`, `caminho` = pai + `/chave`.
- `items` (um schema), `minItems`, `maxItems`: `items`, `minItems`, `maxItems`.
- `minLength`, `maxLength`, `pattern` (`RegExp` sem flags; regex inválida lança erro): `minLength`, `maxLength`, `pattern`.
- `minimum`, `maximum` (inclusivos): `minimum`, `maximum`.
- `enum` e `const` (só valores primitivos, comparação `===`): `enum`, `const`.
- Anotações ignoradas: `$schema`, `$id`, `title`, `description`, `default`, `examples`, `$comment`.
- **Qualquer outra palavra** (por exemplo `$ref`, `oneOf`, `anyOf`, `allOf`, `not`, `if`, `format`, `patternProperties`, `uniqueItems`, `type` como lista) **lança** `SchemaNaoSuportado` com o nome da palavra e o caminho dentro do schema. Schema que não é objeto também lança.

**`contrato.mjs`: contrato de API (decidido aqui).**
- Cabeçalho = **um** bloco cercado cuja linha de abertura é exatamente ```` ```json contrato ```` (sozinha na linha, aceitando `\r` e espaços no fim) e cuja linha de fechamento é ```` ``` ```` sozinha. Aceite BOM no início do arquivo e fim de linha CRLF.
- `export const extrairCabecalho = (texto) => ({ cabecalho, linha })`. Lança `ContratoErro` (com `.erros`, lista de `{ codigo, caminho, mensagem }`) com `codigo`: `SEM_CABECALHO` (nenhum bloco), `CABECALHO_REPETIDO` (mais de um), `BLOCO_ABERTO` (abre e não fecha), `JSON_INVALIDO` (inclua a mensagem do `JSON.parse`).
- `export const lerContrato = (caminhoArquivo, { schemaPath })` lê o arquivo (UTF-8), extrai, valida contra o schema do `schemaPath` e aplica as **regras entre campos**; devolve o cabeçalho **normalizado** (barras `\` viram `/`; `arquivos_de_outro_worker`, `areas_autorizadas` e `ideias` ganham `[]` se ausentes). Erros do schema entram em `ContratoErro.erros` com `codigo: 'SCHEMA'` e o `codigo` original em `mensagem`.
- **Regras entre campos** (todas coletadas, `codigo` próprio): `CAMINHO_INVALIDO` (em `arquivos_permitidos`, `arquivos_de_outro_worker`, `areas_autorizadas`: começa com `/`, tem letra de unidade `x:`, tem parte `..`, ou é vazio depois de normalizar); `CAMINHO_RESERVADO` (qualquer dessas três listas cita `.agent` ou `.agent/...`, que é implícito); `LISTAS_SE_SOBREPOEM` (um caminho de `arquivos_permitidos` é igual, ou está dentro, ou contém um de `arquivos_de_outro_worker`; "dentro" segue a regra de pasta); `CRITERIO_REPETIDO` (dois critérios iguais depois de `trim`).
- `export const casa = (lista, rel) => boolean`: `rel` está na lista quando é igual a uma entrada, ou a entrada termina em `/` e `rel` começa com ela, ou a entrada é pasta sem `/` final e `rel` começa com `entrada + '/'`. Compara com `/` normalizado, **sem** diferenciar maiúscula (Windows). `.agent/` é sempre permitido: `casa` não sabe disso; o `gate` soma.

**`validar.mjs` (CLI).** `node tools/agents/validar.mjs contrato <arquivo.md> [--schema <caminho>]` e `node tools/agents/validar.mjs relatorio <arquivo.json> [--schema <caminho>]`. Sem `--schema`: `docs/v1/infra/modelos/contrato.schema.json` ou `relatorio.schema.json`, relativo à raiz do repositório (ache pela pasta do script). Saída: `OK` (código 0); ou uma linha por erro, `<caminho> <codigo> <mensagem>` (código 1); uso errado, arquivo ou schema inexistente, JSON do relatório quebrado, `SchemaNaoSuportado`: mensagem clara e código 2.

## 4. Base
Worktree `..\notebus-infra` (relativa a `NoteBus\notebus`), branch `infra/m2`, topo `e3be0a8`. Prova de base: `git branch --show-current` = `infra/m2`; `git rev-parse --short HEAD` = `e3be0a8`; `git status --short` mostra no máximo `.agent/`. Antes de começar: `Rename-Item .agent\report.json report-m2-a3.json`. Divergência: pare e avise.

## 5. Arquivos
- **Permitidos:** os do cabeçalho (`tools/agents/lib/` com `schema.mjs`, `contrato.mjs`, `schema.test.mjs`, `contrato.test.mjs` e `fixtures/`; `tools/agents/validar.mjs`; `tools/agents/validar.test.mjs`) e `.agent/report.json` (não rastreado, implícito).
- **Fixtures** (em `tools/agents/lib/fixtures/`): `contrato.schema.json` e `relatorio.schema.json` (cópias **idênticas** às de `docs`; confira com `Get-FileHash` e cole os dois hashes); `relatorio-valido.json` (cópia do `.agent/report-m2-a3.json`); contratos de exemplo em `.md` (válido; com BOM e CRLF; sem cabeçalho; cabeçalho repetido; bloco aberto; JSON quebrado; violações do schema; sobreposição; caminho inválido; caminho reservado; critério repetido).
- **De outro worker / áreas protegidas:** nenhum.

## 6. Dependências
`m2-a3-hook-resolucao` concluído (`e3be0a8`).

## 7. Comandos de validação (uma rodada, cronometrada)
Os do cabeçalho, nesta ordem, cada um com a duração em `comandos[]`. Depois do commit, `git diff --name-only e3be0a8` lista só arquivos do §5.

## 8. Limites
No máximo **30 turnos** e **25 minutos**; ao chegar, pare e relate. Pare e pergunte também se: um dos dois schemas de `docs` usar palavra fora da lista do §3 (a coordenação conferiu que não usa, mas confirme com o teste C4); o relatório do a3 não validar contra o `relatorio.schema.json`; `docs\v1\infra\modelos\contrato.schema.json` não existir.

## 9. Ideias da etapa (D-234)
**116** (cabeçalho JSON no contrato): entra inteira. **76/81** (gate): fora, é o bloco (c), que reusa este código. **86** (trace) e **87** (bloco "Execução"): fora.

## 10. Formato de entrega
Relatório em `.agent/report.json` conforme `relatorio.schema.json`, `tarefa` = `m2-b1-contrato-schema`; **um item por critério do cabeçalho** (`criterio` = o texto do cabeçalho). Prosa só em `duvidas`. Um commit em `infra/m2`: `infra(m2-b1): validador de schema e cabecalho do contrato`. Sem push. Sem percentual de gasto. Ao fim, rode `node tools/agents/validar.mjs relatorio .agent/report.json` (com `--schema`, se `docs/` não estiver na worktree) e cole o resultado.

## 11. Critérios de aceitação (repetidos aqui, no fim, de propósito)
Todos por `node --test`, código de saída 0 (um teste mínimo por linha, nome do teste começa com o id do critério):

1. **C1:** `type` aceita e recusa cada um dos 7 tipos (`integer` recusa `1.5`; `number` recusa `NaN`/`Infinity` se o teste os conseguir criar); `required` ausente nomeia a chave em `caminho`.
2. **C2:** `additionalProperties` falso, verdadeiro e como schema; `properties` aninhado com `caminho` `/a/b`; `items` com `caminho` `/lista/1`; `minItems`, `maxItems`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum` (limite exato passa, um a menos/mais falha), `enum`, `const`. Vários erros no mesmo valor saem todos juntos.
3. **C3:** `$ref`, `oneOf`, `format`, `uniqueItems` e `type: ["string","null"]` lançam `SchemaNaoSuportado` com o nome da palavra; `pattern` inválido lança; as anotações da lista passam sem efeito.
4. **C4:** `fixtures/relatorio-valido.json` valida contra `relatorio.schema.json`. Mutações do relatório, cada uma com o `codigo` e o `caminho` esperados: tirar `commit` (`required`, `/commit`); campo extra (`additional`); `resultado` = `"quase"` (`enum`, `/resultado`); `duracao_s` = -1 (`minimum`, `/comandos/0/duracao_s`); `codigo_saida` = `1.5` (`type`); `status` de um item fora do enum.
5. **C5:** cabeçalho extraído de contrato com BOM e CRLF; `SEM_CABECALHO`; `CABECALHO_REPETIDO`; `BLOCO_ABERTO`; `JSON_INVALIDO` com a mensagem do parse; abertura com texto a mais na linha (` ```json contrato extra `) **não** é cabeçalho.
6. **C6:** o contrato válido volta normalizado (`\` virou `/`, listas ausentes viraram `[]`); cada violação do schema (campo ausente, `harness` fora do enum, `commit` não hexadecimal, `pista` com maiúscula, `turnos` 0, `criterios` vazio, campo extra) dá `codigo: 'SCHEMA'` com o caminho certo.
7. **C7:** `CAMINHO_INVALIDO` para `/etc/x`, `C:/x`, `a/../b`; `CAMINHO_RESERVADO` para `.agent/report.json` e `.agent`; `LISTAS_SE_SOBREPOEM` para igual, para pasta contendo arquivo e para arquivo dentro de pasta; `CRITERIO_REPETIDO`; um contrato com **dois** problemas devolve **os dois** erros.
8. **C8:** `casa`: igual; pasta com `/` final; pasta sem `/` final; `apps/mobile` **não** casa `apps/mobile2/x`; maiúscula diferente casa; barra invertida normaliza.
9. **C9 (CLI, por `child_process`):** `contrato` com o válido → `OK` código 0; com erros → linhas `caminho codigo mensagem` e código 1; `relatorio` válido e inválido; arquivo inexistente, `--schema` inexistente e `SchemaNaoSuportado` → código 2.
10. **C10:** `lerContrato` sobre **este arquivo** (`docs\v1\contratos\m2-b1-contrato-schema.md`, copiado para `fixtures/` sem alteração) com o `contrato.schema.json` devolve o cabeçalho esperado (id, 3 arquivos permitidos, 11 critérios). Esse é o teste de que o formato funciona de ponta a ponta.
11. **C11:** `git diff --name-only e3be0a8` só tem arquivos do §5; `fora_do_pedido` vazio; nenhum push. **Mutações (a coordenação confere):** para cada uma, o teste falha e a primeira linha da falha está **copiada da saída do `node --test` (sem saída colada, conta como não feita)**, depois restaure: (i) `additionalProperties:false` ignorado; (ii) palavra desconhecida ignorada em vez de lançar; (iii) `required` com `caminho` do pai em vez do filho; (iv) extração aceitando mais de um cabeçalho; (v) `casa` sem exigir a `/` (`apps/mobile` casa `apps/mobile2`); (vi) CLI devolvendo 0 quando há erro.

*Repetição do objetivo (§1) e do "não fazer" (§2) em uma linha cada:* **Objetivo:** validador de schema que falha fechado, leitor do cabeçalho do contrato e CLI `validar`, com este contrato validando a si mesmo. · **Não fazer:** dependência, `dispatch`/`gate`/hook, editar arquivo existente, ignorar palavra de schema desconhecida.
