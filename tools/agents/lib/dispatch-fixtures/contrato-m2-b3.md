# Contrato: `m2-b3-dispatch` · `dispatch.mjs`: cria a pista, roda o harness e entrega o relatório validado

> Bloco (b3) do M2 (D-285, D-286). Terceiro de três: b1 (cabeçalho e validador), b2 (adaptadores), **b3 (este)**. Modelo: `v1/infra/modelos/contrato-de-tarefa.md`. **Quem escreve:** a coordenação. **Quem aprova:** o Rick. O worker não edita este contrato.
> **Aceite com harness falso e `--dry-run` (D-286 item 5):** a rodada real com cada harness fica para o M3. Nada aqui chama `claude`, `agy` ou `opencode` de verdade.
> **Base:** o b2 foi aceito pela coordenação no commit `4e2137f` (S-241): 14 testes do b2 e 37 do b1/b1b passam, 6 mutações do contrato mais 3 extras pegas (1 extra sobreviveu: o teste não cobre a deduplicação das permissões do claude, dívida baixa registrada).
> **Risco de tamanho:** é o maior dos três blocos (limites 45 turnos e 40 minutos). Se o worker bater o limite sem fechar, pare e divida em b3a (planejador, prompt, trava, `--dry-run`) e b3b (execução); isso é ajuste de execução, não decisão nova.

```json contrato
{
  "id": "m2-b3-dispatch",
  "modo": "agente normal",
  "executor": { "harness": "claude", "modelo": "sonnet" },
  "base": { "branch": "infra/m2", "commit": "4e2137f" },
  "pista": "notebus-infra",
  "arquivos_permitidos": [
    "tools/agents/dispatch.mjs",
    "tools/agents/dispatch.test.mjs",
    "tools/agents/lib/despacho.mjs",
    "tools/agents/lib/despacho.test.mjs",
    "tools/agents/lib/trava.mjs",
    "tools/agents/lib/trava.test.mjs",
    "tools/agents/lib/dispatch-fixtures/"
  ],
  "comandos_validacao": [
    "node --test tools/agents/lib/despacho.test.mjs tools/agents/lib/trava.test.mjs tools/agents/dispatch.test.mjs",
    "node --test tools/agents/lib/harness/harness.test.mjs tools/agents/lib/schema.test.mjs tools/agents/lib/contrato.test.mjs tools/agents/lib/json.test.mjs tools/agents/validar.test.mjs",
    "git status --short",
    "git diff --name-only 4e2137f"
  ],
  "limites": { "turnos": 45, "minutos": 40 },
  "criterios": [
    "P1 planejar: puro, caminhos, branch e juncoes",
    "P2 prompt: deterministico",
    "P3 trava: cheia, mesma tarefa, liberacao e vencida",
    "P4 dry-run: imprime o plano e nao cria nada",
    "P5 uso errado e contrato invalido: codigo 2",
    "P6 pista nova: worktree, branch, base conferida, juncao",
    "P7 pista que ja existe: codigo 2 sem tocar",
    "P8 harness falso estilo agy: relatorio validado e codigo 0",
    "P9 harness falso estilo opencode: relatorio pelo arquivo e codigo 0",
    "P10 falhas: sem relatorio, relatorio invalido, saida diferente de 0, tempo: codigo 1 e trava liberada",
    "P11 trava cheia: codigo 2 sem criar pista",
    "P12 dados do despacho fora da pista e este contrato e valido",
    "P13 nada fora da lista, mutacoes"
  ],
  "ideias": [116]
}
```

**Linha de aviso (instruções do Projeto):** Modo agente normal · Executor Claude Code local (Sonnet, `claude` dentro da pista) · Por que 1 CLI + 2 módulos puros, tudo com harness falso e repositório git temporário nos testes, sem frentes paralelas · Custo estimado 5 a 6% do limite de 5 h [hipótese; o b1 gastou 3%; o Rick anota o real, D-269]

## 1. Objetivo (observável, uma frase)
`node tools/agents/dispatch.mjs <contrato.md>` valida o contrato, respeita o limite de 2 pistas simultâneas, cria a worktree da tarefa com `node_modules` por junção, roda o harness do contrato (ou um harness falso), valida o relatório contra o schema e deixa autorização, logs e JSON bruto em `NoteBus\_despacho\<tarefa>\`; `--dry-run` só mostra o plano.

## 2. Não fazer
- Não chamar `claude`, `agy` ou `opencode` reais em nenhum teste. Não ligar rede. Não adicionar dependência nem `package.json` em `tools/agents/` (D-254).
- Não escrever `gate`, `merge`, `limpar`, trace ou registro (blocos c, d, e). Não conferir a lista de arquivos do contrato contra o `git diff` (é o `gate`). Não ligar o hook em nenhuma configuração.
- Não editar `lib/schema.mjs`, `lib/contrato.mjs`, `lib/json.mjs`, `lib/harness/` nem `validar.mjs`: **importe** deles. Se faltar algo neles, pare e relate.
- Não criar pista em lugar nenhum fora de `<raiz>\pistas\` nem dado de despacho fora de `<raiz>\_despacho\` (`<raiz>` = `--raiz`, ou a pasta pai do repositório). Nos testes, `--raiz` aponta para uma pasta temporária.
- Não reaproveitar pista existente, não limpar nada (o `limpar` é o bloco e). Não fazer push, tag, workflow `ios`; não tocar `main` nem `e09`; não commitar `.agent/`; não escrever `.md` em `docs/`.
- Não afrouxar uma regra para um teste passar; se um critério exigir mudar o valor esperado: pare e relate.

## 3. Contexto (leia só isto)
Este contrato; `lib/contrato.mjs` (`lerContrato`, `ContratoErro`), `lib/schema.mjs` (`validar`), `lib/json.mjs` (`lerJson`), `lib/harness/index.mjs` (`adaptador`), `validar.mjs` (estilo do CLI e códigos de saída 0/1/2); os dois schemas em `lib/fixtures/`.

**CLI (decidido aqui):** `node tools/agents/dispatch.mjs <contrato.md> [--dry-run] [--raiz <pasta>] [--repo <pasta>] [--schemas <pasta>] [--harness-falso <script.mjs>] [--max-simultaneas <n>] [--timeout-ms <n>]`.
- `--repo`: repositório de onde sai a worktree (padrão: `git rev-parse --show-toplevel` no diretório atual). `--raiz`: padrão = pasta pai de `--repo`. `--schemas`: pasta com `contrato.schema.json` e `relatorio.schema.json` (padrão: `<repo>/docs/v1/infra/modelos`). `--max-simultaneas`: padrão 2 (D-230). `--timeout-ms`: padrão `limites.minutos * 60000`; existe para os testes.
- `--harness-falso <script.mjs>`: em vez de `exe`, executa `process.execPath` com `[script, ...args]` (os mesmos `args` do adaptador). O script falso é de teste.
- Códigos de saída: **0** relatório válido entregue (o `resultado` do relatório, `ok` ou não, é assunto do `gate`); **1** a execução falhou (sem relatório, relatório inválido, saída do harness diferente de 0 sem relatório válido, tempo esgotado); **2** uso errado, contrato inválido, trava cheia, pista que já existe, base divergente, executável não encontrado. Mensagem de uma linha: `OK <id> ...` ou `FALHA <CODIGO> <texto>`.

**`lib/despacho.mjs` (puro, sem fs nem processo):**
- `planejar(contrato, { raiz, repo }) => { id, branch, base, pista: { nome, caminho }, despachoDir, junctions: [{ de, para }], arquivosDespacho: { autorizacao, schema, saida, stderr, relatorio, meta } }`. `branch` = `tarefa/<id>`. `pista.caminho` = `<raiz>/pistas/<pista>`. `despachoDir` = `<raiz>/_despacho/<id>`. `junctions` = as 6 pastas `''`, `apps/mobile`, `packages/domain`, `tools/licenses`, `tools/mobilis-seed`, `tools/mvp-report`, cada uma com `de` = `<repo>/<pasta>/node_modules` e `para` = `<pista>/<pasta>/node_modules` (a pasta `''` é a raiz). Caminhos montados com `node:path` (`path.join`), nada de `\` escrito à mão.
- `montarPrompt(contrato) => string`: texto fixo, o mesmo para a mesma entrada: manda ler `.agent/contrato.md` inteiro, trabalhar só dentro da pasta atual, seguir critérios e limites, **um comando por chamada de terminal, sem `;`, `&&` nem `|`**, e entregar o relatório no schema com um item por critério; cita o `id` do contrato. Sem data, sem aleatório.

**`lib/trava.mjs`:** arquivos `<raiz>/_despacho/_trava/<id>.lock` com `{ id, pid, inicio, minutos }` (JSON).
- `adquirir({ raiz, id, minutos, max, agora = Date.now() }) => { ok, liberar }`. Recusa com `{ ok:false, codigo:'TRAVA_CHEIA'|'JA_EM_ANDAMENTO', ativos:[ids] }`. Trava **vencida** (idade maior que `2 * minutos` da própria trava) é removida e não conta. `liberar()` é idempotente e remove o arquivo. Cria as pastas que faltarem.

**`dispatch.mjs` (nesta ordem):** (1) `lerContrato` com o `contrato.schema.json` (erros: imprime e sai 2); (2) `planejar`; (3) `--dry-run`: imprime em JSON o plano e o comando (`{ plano, comando: { exe, args } }`, com o prompt dentro de `args`) e **sai 0 sem criar pasta, trava nem arquivo**; (4) trava (`adquirir`; cheia: sai 2 **antes** de criar qualquer coisa); `liberar()` em `finally`, sempre; (5) pista inexistente (existente: `PISTA_EXISTE`, sai 2, não toca): `git worktree add <pista> -b tarefa/<id> <base.commit>` a partir do `--repo`; depois as junções cuja `de` existe **e** cujo pai de `para` existe na pista (o resto é pulado, com uma linha no log); `git rev-parse --short HEAD` na pista deve começar com `base.commit` (ou o contrário, para hashes de tamanhos diferentes): senão `BASE_DIVERGENTE`, sai 2 (a pista fica para inspeção); (6) grava `.agent/contrato.md` (cópia do arquivo do contrato) na pista e, em `despachoDir`, `autorizacao.json` (`{ tarefa, areas_autorizadas, arquivos_permitidos }`) e a cópia do `relatorio.schema.json`; (7) `adaptador(harness).montarComando(contrato, { prompt, schemaTexto, schemaCaminho })`, onde `schemaCaminho` é o da cópia em `despachoDir`; executa com `spawn` (sem shell, diretório = pista), stdout e stderr para `saida.txt` e `stderr.txt` em `despachoDir`; passou do tempo: mata o processo, `TEMPO_ESGOTADO`, sai 1; executável inexistente (`ENOENT`): `EXECUTAVEL_NAO_ENCONTRADO` com dica de PATH, sai 2 [hipótese: shims `.cmd` do Windows podem exigir shell; só a rodada real do M3 mostra, anote em `duvidas`]; (8) `lerSaida(stdout)`: se `relatorio` veio, use-o; se o código é `RELATORIO_NO_ARQUIVO` ou não veio, leia `<pista>/.agent/report.json` com `lerJson`; sem nenhum: `SEM_RELATORIO`, sai 1; (9) `validar(relatorio.schema.json, relatorio)`: erros: imprime `caminho codigo mensagem` e sai 1; ok: grava `relatorio.json` em `despachoDir` e, se veio do stdout, também em `<pista>/.agent/report.json`; (10) grava `meta.json` (`id`, `harness`, `exe`, `inicio`, `fim`, `duracao_s`, `codigo_saida`, `meta` do adaptador, `validacao: 'ok'|'erros'`, `avisos`); `avisos` inclui `TAREFA_DIFERENTE` quando `relatorio.tarefa !== id` (aviso, não falha); (11) imprime `OK <id> relatorio valido em <caminho>` e sai 0.

## 4. Base
Worktree `..\notebus-infra`, branch `infra/m2`, topo `4e2137f`. Prova de base: `git branch --show-current` = `infra/m2`; `git rev-parse --short HEAD` = `4e2137f`; `git status --short` mostra no máximo `.agent/`. Antes de começar: `Rename-Item .agent\report.json report-m2-b2.json`. Divergência: pare e avise.

## 5. Arquivos
- **Permitidos (lista fechada):** os do cabeçalho: `tools/agents/dispatch.mjs`, `dispatch.test.mjs`; `tools/agents/lib/despacho.mjs`, `despacho.test.mjs`, `trava.mjs`, `trava.test.mjs`; `tools/agents/lib/dispatch-fixtures/` (contratos de exemplo, `harness-agy.mjs`, `harness-opencode.mjs`, `harness-falha.mjs`, `harness-lento.mjs`, relatórios válido e inválido); `.agent/report.json` (não rastreado).
- **De outro worker / áreas protegidas:** nenhum.

## 6. Dependências
`m2-b2-adaptadores` concluído e aceito pela coordenação.

## 7. Comandos de validação (uma rodada, cronometrada)
Os do cabeçalho, nesta ordem, cada um com a duração em `comandos[]`. Depois do commit, `git diff --name-only <base>` lista só arquivos do §5.

## 8. Limites
No máximo **45 turnos** e **40 minutos**; ao chegar, pare e relate (com o que ficou pronto, para a divisão em b3a/b3b). Pare e pergunte também se: `git` não puder criar worktree dentro de um repositório temporário; qualquer teste do b1, b1b ou b2 cair; faltar algo em `lib/harness/` ou `lib/contrato.mjs` (não edite).

## 9. Ideias da etapa (D-234)
**116**: o `dispatch` consome o cabeçalho. **86** (trace) e **87** (bloco "Execução"): fora, blocos d e f. **76/81** (gate): fora, bloco c.

## 10. Formato de entrega
Relatório em `.agent/report.json` conforme `relatorio.schema.json`, `tarefa` = `m2-b3-dispatch`; **um item por critério do cabeçalho**. Prosa só em `duvidas` (inclua as hipóteses do §3 e o que você viu do git no Windows). Um commit em `infra/m2`: `infra(m2-b3): dispatch com trava, pista, harness falso e relatorio validado`. Sem push. Sem percentual de gasto. Ao fim, rode `node tools/agents/validar.mjs relatorio .agent/report.json --schema tools/agents/lib/fixtures/relatorio.schema.json` e cole o resultado.

## 11. Critérios de aceitação (repetidos aqui, no fim, de propósito)
Todos por `node --test`, código de saída 0, um teste mínimo por linha, nome do teste começa com o id do critério. Os testes de CLI usam `child_process` e, quando precisam de git, um **repositório temporário** (`git init`, `user.name`/`user.email` locais, um commit com `node_modules/` vazio ignorado fora do git) e `--raiz` temporária; nunca o repositório real.

1. **P1:** `planejar` dá `branch` `tarefa/<id>`, `pista.caminho` = `path.join(raiz,'pistas',nome)`, `despachoDir` = `path.join(raiz,'_despacho',id)`, 6 `junctions` com `de`/`para` certos, `arquivosDespacho` dentro de `despachoDir`; chamada duas vezes dá `deepEqual`; não altera o `contrato` (`structuredClone`); o módulo não importa `node:fs` nem `node:child_process`.
2. **P2:** `montarPrompt` contém o `id`, `.agent/contrato.md`, `um comando por chamada` e `sem ;`; duas chamadas iguais; contratos diferentes dão prompts diferentes só no `id`.
3. **P3:** `adquirir` com `max` 2: a 3ª recusa `TRAVA_CHEIA` com os 2 ids em `ativos`; mesmo `id` duas vezes `JA_EM_ANDAMENTO`; `liberar()` chamada duas vezes não lança e libera a vaga; trava com `inicio` mais velho que `2*minutos` (com `agora` injetado) é removida e não conta; pastas ausentes são criadas.
4. **P4:** `--dry-run` imprime JSON com `plano` e `comando`; `comando.exe` e `args[0]` conforme o harness (`-p` ou `run`); **depois dele a pasta `--raiz` continua vazia** (nenhuma pasta, trava ou arquivo) e o repositório temporário não ganhou worktree; código 0.
5. **P5:** sem argumentos, arquivo inexistente, `--max-simultaneas abc`, flag desconhecida e contrato com cabeçalho inválido dão código **2**; o de contrato inválido imprime as linhas `caminho codigo mensagem`; nenhuma pasta criada.
6. **P6:** execução com `--harness-falso` cria a pista em `<raiz>/pistas/<pista>`, branch `tarefa/<id>`, `git rev-parse --short HEAD` da pista = `base.commit`; se o repositório temporário tem `node_modules` na raiz, a pista tem `node_modules` como link; pastas que não existem na pista são puladas sem erro; `.agent/contrato.md` na pista é igual ao arquivo do contrato; `base.commit` errado dá `BASE_DIVERGENTE` e código 2.
7. **P7:** segunda execução do mesmo contrato (pista já existe) dá `PISTA_EXISTE`, código 2, e **nenhum arquivo da pista mudou** (compare lista e `mtime` ou hash antes e depois); a trava foi liberada.
8. **P8:** `harness-agy.mjs` (script falso que imprime `{ "conversation_id": "x", "status": "SUCCESS", "response": "<relatório válido em texto>" }` e cria e commita um arquivo na pista) com contrato `executor.harness = agy`: código 0, `OK` na saída, `relatorio.json` e `meta.json` em `despachoDir`, `<pista>/.agent/report.json` igual ao relatório, `autorizacao.json` com `areas_autorizadas` e `arquivos_permitidos` do contrato, `saida.txt` com o stdout; `meta.json.validacao` = `ok`; relatório com `tarefa` diferente do `id` dá código 0 e `avisos` com `TAREFA_DIFERENTE`.
9. **P9:** `harness-opencode.mjs` (escreve `.agent/report.json` válido na pista e imprime texto livre) com `executor.harness = opencode`: código 0; o relatório vem do arquivo; `relatorio.json` em `despachoDir` igual.
10. **P10:** (a) harness que sai com 3 e não deixa relatório: código 1, `SEM_RELATORIO`; (b) relatório com campo faltando: código 1 e as linhas `caminho codigo mensagem`; (c) `harness-lento.mjs` com `--timeout-ms 300`: código 1, `TEMPO_ESGOTADO`, e o processo filho **não** continua vivo; (d) `harness` inexistente com `exe` real que não existe (sem `--harness-falso`, `PATH` limpo no `env` do filho): código 2, `EXECUTAVEL_NAO_ENCONTRADO`. Em **todos**, a trava foi liberada (`_trava` vazia) e `meta.json` existe quando a execução chegou ao passo 7.
11. **P11:** com 2 travas ativas, `dispatch` dá `TRAVA_CHEIA`, código 2, e **não criou** a pista nem o `despachoDir` da tarefa nova; com `--max-simultaneas 3` a mesma situação roda.
12. **P12:** nada foi escrito dentro do repositório temporário além de `.git/worktrees` (o `git status --short` do repositório principal fica limpo); todos os dados do despacho estão em `<raiz>/_despacho/<id>/`; `lerContrato` sobre este arquivo (cópia **sem alteração** em `lib/dispatch-fixtures/contrato-m2-b3.md`; o teste só confere o formato) devolve id `m2-b3-dispatch`, 7 arquivos permitidos e 13 critérios.
13. **P13:** `git diff --name-only <base>` só tem arquivos do §5; `fora_do_pedido` vazio; nenhum push; os testes do b1, b1b e b2 continuam passando sem troca. **Mutações (a coordenação confere):** para cada uma o teste falha e a primeira linha da falha está **copiada da saída do `node --test`**, depois restaure: (i) `--dry-run` criando a pasta de despacho; (ii) `liberar()` fora do `finally` (a trava fica em falha); (iii) a checagem de pista existente removida; (iv) `TEMPO_ESGOTADO` sem matar o processo; (v) o fallback do relatório pelo arquivo removido; (vi) a trava cheia checada **depois** de criar a pista.

*Repetição do objetivo (§1) e do "não fazer" (§2) em uma linha cada:* **Objetivo:** `dispatch` cria a pista, roda o harness (falso nos testes), valida o relatório e guarda tudo em `_despacho`; `--dry-run` só planeja. · **Não fazer:** harness real, `gate`/`merge`/`limpar`, editar módulos dos blocos anteriores, reaproveitar pista, escrever fora de `pistas/` e `_despacho/`.
