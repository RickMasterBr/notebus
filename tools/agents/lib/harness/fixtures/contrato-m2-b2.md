# Contrato: `m2-b2-adaptadores` · Adaptadores puros dos 3 harnesses (comando e leitura da saída)

> Bloco (b2) do M2 (D-285, D-286). Segundo de três: b1 (cabeçalho e validador, `7990a63`, ajustado no b1b), **b2 (este)**, b3 (`dispatch.mjs`). Modelo: `v1/infra/modelos/contrato-de-tarefa.md`. **Quem escreve:** a coordenação. **Quem aprova:** o Rick. O worker não edita este contrato.
> **Por que existe:** o `dispatch` (b3) precisa montar a linha de comando de cada harness e ler a saída de cada um, e os três divergem. Isolar isso em funções puras, testadas com saídas reais gravadas (arquivos dourados), deixa o `dispatch` sem `if harness`.
> **Base:** o b1b foi aceito pela coordenação no commit `5153508` (S-241): 37 testes passam, 5 mutações do contrato mais 2 extras pegas, relatório `OK`.

```json contrato
{
  "id": "m2-b2-adaptadores",
  "modo": "agente normal",
  "executor": { "harness": "claude", "modelo": "sonnet" },
  "base": { "branch": "infra/m2", "commit": "5153508" },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools/agents/lib/harness/"
  ],
  "comandos_validacao": [
    "node --test tools/agents/lib/harness/harness.test.mjs",
    "node --test tools/agents/lib/schema.test.mjs tools/agents/lib/contrato.test.mjs tools/agents/lib/json.test.mjs tools/agents/validar.test.mjs",
    "git status --short",
    "git diff --name-only 5153508"
  ],
  "limites": { "turnos": 30, "minutos": 25 },
  "criterios": [
    "H1 interface: adaptador(harness) e erro para harness desconhecido",
    "H2 claude: montarComando",
    "H3 agy: montarComando",
    "H4 opencode: montarComando",
    "H5 claude: lerSaida com saida real e casos de erro",
    "H6 agy: lerSaida com saida real e casos de erro",
    "H7 opencode: lerSaida sem saida estruturada",
    "H8 puras: sem fs, sem rede, sem processo",
    "H9 este contrato e valido",
    "H10 nada fora da lista, mutacoes"
  ],
  "ideias": [116]
}
```

**Linha de aviso (instruções do Projeto):** Modo agente normal · Executor Claude Code local (Sonnet, `claude` dentro da pista) · Por que 4 módulos puros pequenos, arquivos dourados reais, sem frentes paralelas · Custo estimado 3% do limite de 5 h [hipótese; o Rick anota o real, D-269]

## 1. Objetivo (observável, uma frase)
`tools/agents/lib/harness/` tem um adaptador puro por harness (`claude`, `agy`, `opencode`) com `montarComando` e `lerSaida`, mais o seletor `adaptador(harness)`, e `node --test` prova cada um com saídas reais gravadas.

## 2. Não fazer
- Não executar processo, ler ou escrever arquivo, nem acessar rede dentro dos adaptadores: **só funções puras** (texto e objetos entram, objetos saem). Os testes é que leem as fixtures.
- Não escrever `dispatch`, trava, worktree, junção, prompt do worker ou gate (é o b3 e o bloco c). Não tocar hook, `lib/schema.mjs`, `lib/contrato.mjs`, `validar.mjs`.
- Não adicionar dependência nem `package.json`. Não usar `--auto` do OpenCode (D-266). Não usar `--format json` do OpenCode (nunca foi provado).
- Não inventar formato de saída que nenhum spike mostrou: onde só há hipótese, o código marca `[hipótese]` no comentário e o relatório lista em `duvidas`.
- Não afrouxar uma regra para um teste passar; se um critério exigir mudar o valor esperado: pare e relate.
- Sem push, tag, workflow `ios`; não tocar `main` nem `e09`; não commitar `.agent/`; não escrever `.md` em `docs/`.

## 3. Contexto (leia só isto)
Este contrato; `tools/agents/lib/contrato.mjs` (só para ver a forma do cabeçalho normalizado); os dois schemas em `lib/fixtures/` (o `relatorio.schema.json` é o que `lerSaida` entrega validado pelo b3, não aqui); e as saídas reais abaixo.

**Saídas reais (copiar SEM alterar para `lib/harness/fixtures/`, mostrar `Get-FileHash` de cada):**
- `..\_spk04\claude-saida.json` → `claude-ok.json` (saída do `claude -p --output-format json`; **tem BOM** porque foi redirecionada pelo PowerShell 5; campos úteis: `type`, `subtype`, `is_error`, `num_turns`, `duration_ms`, `total_cost_usd`, `session_id`, `result` (texto, é o JSON do relatório em string), `structured_output` (o relatório como objeto), `permission_denials`).
- `..\_spk04e\agy.json` → `agy-ok.json` (saída do `agy -p --output-format json`; campos: `conversation_id`, `status` (`SUCCESS`), `response` (**texto**, o JSON do relatório em string)).
- `opencode-ok.txt`: **não existe saída real em JSON** (SPK-05 usou saída em texto e arquivo). O worker cria um texto **sintético** de 3 linhas, com cabeçalho de comentário `# SINTETICO: nao e saida real do opencode`.

**Interface (decidida aqui), arquivo `lib/harness/index.mjs`:**
`export const adaptador = (harness) => ({ nome, montarComando, lerSaida })` com `harness` em `claude|agy|opencode`; outro valor lança `Error` com `harness desconhecido: <valor>`. Cada adaptador mora em `lib/harness/<nome>.mjs` e exporta `montarComando` e `lerSaida`.

`montarComando(contrato, { prompt, schemaTexto, schemaCaminho }) => { exe, args }` — `contrato` é o cabeçalho **normalizado** (`lerContrato`); `exe` é o nome do programa (`claude`, `agy`, `opencode`), `args` a lista de argumentos **sem** passar por shell (cada elemento é um argumento, sem aspas). O diretório de execução é a pista (quem chama decide; o adaptador não o conhece).
- **claude:** `['-p', prompt, '--output-format', 'json', '--json-schema', schemaTexto, '--max-turns', String(contrato.limites.turnos), '--allowedTools', ...permitidas]`. O prompt vem **logo depois** de `-p` e `--allowedTools` é **o último** (ela engole o que vem depois). `permitidas` = `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Bash(git status*)`, `Bash(git diff*)`, `Bash(git log*)`, `Bash(git add*)`, `Bash(git commit*)`, mais um `Bash(<comando>*)` para **cada** `comandos_validacao` que não começa com `git ` (sem duplicar). Modelo: `--model` + `contrato.executor.modelo` logo antes de `--max-turns`.
- **agy:** `['-p', prompt, '--mode', 'accept-edits', '--output-format', 'json', '--json-schema', schemaCaminho]`. `schemaCaminho` é caminho de **arquivo** (nunca texto: o PowerShell 5.1 quebra aspas e acentos). Sem `--model` (o `agy` não recebe modelo por flag nos spikes).
- **opencode:** `['run', prompt, '--model', contrato.executor.modelo]`. **Nunca** `--auto`, **nunca** `--format json`. `schemaTexto`/`schemaCaminho` são ignorados (o relatório vem do arquivo `.agent/report.json`, ver H7).
- `montarComando` lança `Error` se `prompt` não for string não vazia, ou (claude) se `schemaTexto` não for string não vazia, ou (agy) se `schemaCaminho` não for string não vazia.

`lerSaida(texto) => { ok, relatorio, meta, erro }` — `texto` é o conteúdo bruto do stdout (pode ter BOM); **nunca lança**: qualquer falha vira `ok:false` com `erro: { codigo, mensagem }`.
- `relatorio`: objeto ou `null`. `meta`: `{ turnos, custo_usd, duracao_ms, sessao }` com `null` no que o harness não informa.
- **claude:** tira BOM; `JSON.parse`; se `is_error` verdadeiro: `erro.codigo = 'CLAUDE_ERRO'` (`mensagem` = `subtype` e, se houver, `result`); senão `relatorio = structured_output` se for objeto, senão tenta `JSON.parse(result)`; se nada serve: `SEM_RELATORIO`. `meta`: `turnos = num_turns`, `custo_usd = total_cost_usd`, `duracao_ms`, `sessao = session_id`. JSON quebrado: `SAIDA_INVALIDA`.
- **agy:** tira BOM; `JSON.parse`; `status !== 'SUCCESS'`: `AGY_STATUS` (`mensagem` = o status); senão `relatorio = JSON.parse(response)` (se `response` não é texto ou não é JSON de objeto: `SEM_RELATORIO`). `meta`: `sessao = conversation_id`, o resto `null`. JSON quebrado: `SAIDA_INVALIDA`.
- **opencode:** `ok:false`, `relatorio:null`, `erro.codigo = 'RELATORIO_NO_ARQUIVO'` (`mensagem`: "o opencode nao devolve relatorio estruturado no stdout; ler .agent/report.json"), `meta` toda `null`. É a **forma esperada**, não uma falha; o b3 trata esse código lendo o arquivo [hipótese até a rodada real do M3].

## 4. Base
Worktree `..\notebus-infra`, branch `infra/m2`, topo `5153508`. Prova de base: `git branch --show-current` = `infra/m2`; `git rev-parse --short HEAD` = `5153508`; `git status --short` mostra no máximo `.agent/`. Antes de começar: `Rename-Item .agent\report.json report-m2-b1b.json`. Divergência: pare e avise.

## 5. Arquivos
- **Permitidos (lista fechada):** `tools/agents/lib/harness/` inteira: `index.mjs`, `claude.mjs`, `agy.mjs`, `opencode.mjs`, `harness.test.mjs`, `fixtures/` (`claude-ok.json`, `agy-ok.json`, `opencode-ok.txt` e as variações de erro que os testes precisarem, montadas **a partir** das reais com `JSON.parse`/`stringify` dentro do teste, não copiadas à mão); `.agent/report.json` (não rastreado).
- **De outro worker / áreas protegidas:** nenhum.

## 6. Dependências
`m2-b1b-ajustes-schema` concluído e aceito pela coordenação (cabeçalho normalizado de `lerContrato`).

## 7. Comandos de validação (uma rodada, cronometrada)
Os do cabeçalho, nesta ordem, cada um com a duração em `comandos[]`. Depois do commit, `git diff --name-only <base>` lista só arquivos do §5.

## 8. Limites
No máximo **30 turnos** e **25 minutos**; ao chegar, pare e relate. Pare e pergunte também se: `..\_spk04\claude-saida.json` ou `..\_spk04e\agy.json` não existir; o `relatorio` extraído de `claude-ok.json` não tiver `tarefa`, `commit` e `resultado`; qualquer teste do b1/b1b cair.

## 9. Ideias da etapa (D-234)
**116** (cabeçalho JSON no contrato): o adaptador consome o cabeçalho normalizado. O despacho em si é o b3; nenhuma outra ideia da distribuição entra aqui.

## 10. Formato de entrega
Relatório em `.agent/report.json` conforme `relatorio.schema.json`, `tarefa` = `m2-b2-adaptadores`; **um item por critério do cabeçalho**. Prosa só em `duvidas` (inclua: os 3 hashes das fixtures, o que é hipótese, e o texto do `--help` do que você precisou conferir). Um commit em `infra/m2`: `infra(m2-b2): adaptadores puros de claude, agy e opencode`. Sem push. Sem percentual de gasto. Ao fim, rode `node tools/agents/validar.mjs relatorio .agent/report.json --schema tools/agents/lib/fixtures/relatorio.schema.json` e cole o resultado.

## 11. Critérios de aceitação (repetidos aqui, no fim, de propósito)
Todos por `node --test`, código de saída 0, um teste mínimo por linha, nome do teste começa com o id do critério. Contrato de teste: um `contrato` de exemplo normalizado (id, executor, `limites: {turnos: 12, minutos: 20}`, `comandos_validacao: ["node --test x.mjs", "git status --short", "npx vitest run"]`).

1. **H1:** `adaptador('claude'|'agy'|'opencode')` devolve `nome`, `montarComando`, `lerSaida`; `adaptador('codex')`, `adaptador('')` e `adaptador('toString')` lançam `harness desconhecido: ...`.
2. **H2:** `montarComando` do claude devolve `exe: 'claude'`; `args[0] === '-p'`, `args[1] === prompt`; contém `--output-format json`, `--json-schema <schemaTexto>`, `--model <modelo>` antes de `--max-turns 12`; `--allowedTools` vem depois de `--max-turns` e tudo que vem depois dela são as permitidas (é o **fim da lista**); `Bash(node --test x.mjs*)` e `Bash(npx vitest run*)` estão lá, `Bash(git status --short*)` **não** (já coberto por `git status*`), sem duplicata; prompt vazio, `schemaTexto` vazio e `contrato` sem `limites` lançam.
3. **H3:** agy: `args` = `['-p', prompt, '--mode', 'accept-edits', '--output-format', 'json', '--json-schema', schemaCaminho]` exatamente; sem `--model`; `schemaCaminho` ausente lança; `exe: 'agy'`.
4. **H4:** opencode: `args` = `['run', prompt, '--model', modelo]` exatamente; nenhum argumento contém `--auto` nem `--format`; `exe: 'opencode'`.
5. **H5:** `lerSaida` sobre `claude-ok.json` (com BOM): `ok:true`, `relatorio` com `tarefa`, `commit`, `resultado:'ok'`, `meta.turnos === 10`, `custo_usd` número, `sessao` texto. Variações montadas no teste: `is_error:true` → `CLAUDE_ERRO` com o `subtype`; sem `structured_output` mas com `result` JSON → `ok:true`; sem os dois → `SEM_RELATORIO`; texto qualquer e texto vazio → `SAIDA_INVALIDA`; **nenhuma lança**.
6. **H6:** `lerSaida` sobre `agy-ok.json`: `ok:true`, `relatorio` com `commit` e `arquivos_mudados`, `meta.sessao` texto, `turnos` `null`. Variações: `status:'ERROR'` → `AGY_STATUS`; `response` que não é JSON → `SEM_RELATORIO`; `response` número → `SEM_RELATORIO`; JSON quebrado → `SAIDA_INVALIDA`; com BOM igual sem BOM; nenhuma lança.
7. **H7:** `lerSaida` do opencode devolve, para `opencode-ok.txt`, texto vazio e `undefined`, sempre `ok:false`, `relatorio:null`, `erro.codigo === 'RELATORIO_NO_ARQUIVO'`, `meta` com 4 `null`.
8. **H8:** nenhum dos 4 módulos importa `node:fs`, `node:child_process`, `node:net`, `node:http(s)`, `node:os`, `node:path` nem `node:url` (teste lê o texto dos módulos e procura `import` e `require`; as fixtures são lidas **pelo teste**); `montarComando` chamada duas vezes com a mesma entrada dá saída `deepEqual` e não altera `contrato` (comparar com cópia `structuredClone`).
9. **H9:** `lerContrato` sobre este arquivo (cópia **sem alteração** em `lib/harness/fixtures/contrato-m2-b2.md`, o teste só confere o formato) com o `contrato.schema.json` devolve id `m2-b2-adaptadores`, 1 arquivo permitido, 10 critérios.
10. **H10:** `git diff --name-only <base>` só tem arquivos do §5; `fora_do_pedido` vazio; nenhum push. **Mutações (a coordenação confere):** para cada uma o teste falha e a primeira linha da falha está **copiada da saída do `node --test`**, depois restaure: (i) `--allowedTools` movida para antes do prompt; (ii) `--auto` acrescentado ao opencode; (iii) `lerSaida` do claude ignorando `is_error`; (iv) `lerSaida` do agy sem tirar o BOM; (v) um `import` de `node:fs` em `claude.mjs`; (vi) `lerSaida` do claude lançando em JSON quebrado.

*Repetição do objetivo (§1) e do "não fazer" (§2) em uma linha cada:* **Objetivo:** três adaptadores puros (comando e leitura da saída) testados com saídas reais. · **Não fazer:** processo, arquivo ou rede nos adaptadores; `dispatch`/trava/worktree; `--auto` ou `--format json` no OpenCode; inventar formato de saída.
