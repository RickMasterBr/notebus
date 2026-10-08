# AGENTS.md — NoteBus (regras para qualquer agente de código)

Este arquivo vale para Antigravity, Codex ou qualquer ferramenta que não seja o Claude Code. As regras completas do projeto estão em `notebus-docs/docs/fase-6/CLAUDE.md`; leia-o também.

## O projeto

App de caderno de horários de ônibus (MOBILIS Leiria), Expo SDK 57, React Native, para iPhone. Monorepo: `packages/domain` (TypeScript puro) e `apps/mobile`. Os dados da MOBILIS **nunca** entram neste repositório público (D-091); exemplos de teste usam dados inventados.

## Escopo: faça só o que o prompt pede

1. Mexa **apenas** nos arquivos que a tarefa exige. Se um teste falhar por motivo alheio à tarefa (lento, flaky, ambiente Windows), **pare e relate**: não otimize código de produção nem altere teste para fazê-lo passar.
2. **Nunca afrouxe, apague ou reescreva um teste existente** para passar (limites, tempos, `skip`, `only`). Teste novo pode ser criado. Se um teste antigo estiver errado, diga qual e por quê, e espere.
3. **Não toque** em `packages/domain`, em `noDirectClock.test.ts` (garante um só ponto de leitura do relógio), nem no reducer da pilha de folhas (`stack.ts`) sem teste novo cobrindo o caso. Não adicione dependências, não renomeie nem mova arquivos além do necessário.
4. Se a correção exigir mudar o **significado** de algo (regra de negócio, formato de dado, pilha de folhas), **pare e relate** em vez de improvisar.

## Código

- **Antes de mexer em tela, folha ou texto, leia `DESIGN.md` (raiz do repositório).** Tokens, quadro das folhas (D-150), um só ✕, textos pelo catálogo, vocabulário da tela. Se uma regra dele contradisser o plano, **pare e relate**.
- Textos só no catálogo (`pt-BR.ts`), nunca soltos no componente. Sem emoji.
- Rolagem de folhas: siga a skill `diagnostico-rolagem-bottom-sheet` (lista numa `View` de altura fixa, `detentMetrics`/`scrollInset.ts`, sem constante nova). Não invente painel de diagnóstico.
- Alvo de toque ≥ 44 pt. Respeite "Reduzir movimento".
- Não dispare workflow do GitHub, não escreva `.md` em `docs/`, não faça push na `main`.
- Commits na branch indicada, uma mudança por commit, mensagem começando por `E-03:` (ou a etapa do prompt).

## Verificação

Rode no fim: `npm ci && npm run typecheck && npm test` e `npx expo export --platform ios`. Tudo tem de passar, sem `skip`.

## Relatório

Tabela por item: causa → arquivos mudados → teste → **como saber que passou no iPhone**.
- Marque `[provada por teste]` **só** quando um teste automático falhava antes e passa depois, e diga qual. Comportamento visual, animação, teclado e gesto são `[hipótese, só o aparelho decide]`, mesmo com teste de lógica ao lado.
- Liste **tudo** que mudou fora do pedido (arquivo e motivo). Se não houver, diga "nada fora do pedido".
- Resultado dos três comandos de verificação, nome da branch e hash do último commit.

## Multiagente (Teamwork e /boost)

Antes de pedir ou aceitar um Teamwork, leia `docs/ai/modos-de-execucao.md` (quando usar, orçamento, modelo de prompt). Ponto de partida de leitura: `docs/ai/mapa-para-agentes.md`. Teamwork e /boost seguem todas as regras acima. Agentes especialistas ficam em `.agents/agents/` e são só leitura, salvo pedido explícito.
