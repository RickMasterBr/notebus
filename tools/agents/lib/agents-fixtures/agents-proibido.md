# AGENTS.md — NoteBus (índice para qualquer agente)

> Rascunho da v1 (S-231; D-240 acrescentada na S-234). Vale para Claude Code, Antigravity e OpenCode. O `CLAUDE.md` só importa este arquivo.

## O projeto
Caderno pessoal de horários de ônibus (MOBILIS, Leiria). Expo SDK 57 + TypeScript estrito, iPhone primeiro.
Monorepo: `packages/domain` (TS puro), `apps/mobile`, `tools/`. Documentação no repositório privado `notebus-docs`, clonado em `docs/`.

## Regras de ouro
1. **O contrato da tarefa manda.** Fora dele, pare e relate. Decisão nova não se toma: vira dúvida no relatório.
2. **Só os arquivos da lista do contrato.** Arquivo de outra tarefa não se toca.
3. **Áreas protegidas** (só com o contrato dizendo): `packages/domain`, esquema e migrações (`schema.ts`), backup (`backup.ts`), `stack.ts`, `StackedSheet.tsx`, `noDirectClock.test.ts`.
4. **Nunca afrouxe, apague ou reescreva teste existente.** Teste novo pode.
5. **Nada da MOBILIS nem dado pessoal neste repositório** (D-091). Exemplo de teste é inventado.
6. **Diga "não sei" ou "não verifiquei"** quando for o caso, com como verificar. Toda afirmação tem origem (comando colado, arquivo e linha) ou leva `[hipótese]`.
7. Toque, gesto, rolagem, teclado e VoiceOver: `[hipótese, só o aparelho decide]`.
8. **Relatório no schema** (`docs/v1/infra/modelos/relatorio.schema.json`), em `.agent/report.json`. Prosa só em `duvidas`.
9. Não escreva em `docs/` (a pista nem tem essa pasta). O registro da tarefa é gerado do seu relatório pelo `trace`; você só entrega o `.agent/report.json`.
10. Sem push na `main`, tag, workflow, dependência nova ou `--dangerously-skip-permissions`.
11. **Script em vez de cadeia de chamadas (D-240).** Contar, listar tudo, comparar e conferir são trabalho de comando, não de leitura arquivo por arquivo. Use um comando que devolva a lista completa e curta (com "N achados, M mostrados"); se não existir, peça o utilitário no relatório (`ideias_novas`) em vez de montar a lista de cabeça. Lista montada à mão sai incompleta.
12. **Memória automática do harness não é fonte (D-240).** Só vale o que está em arquivo do repositório ou de `docs/`. Se você "lembra" de algo de outra sessão, confirme no arquivo antes de usar.
13. **Contrato:** o objetivo e o "não fazer" estão no topo e os critérios de aceitação se repetem no fim (D-240). Confira os dois antes de entregar.

Atualize o BOOT ao fim.

## Ambiente
Windows + PowerShell. Pastas: principal `NoteBus\notebus`; worktrees em `.claude\worktrees\` ou `NoteBus\pistas\<tarefa>`; saídas temporárias em `NoteBus\_saida\` (fora do repo).
Regras de ambiente e dados: `docs/v1/regras/ambiente.md`.

## Comandos
- `npm ci` (só na pasta principal; worktree usa junção do `node_modules`)
- `npm run typecheck`
- Testes por pacote: `npm test -w packages/domain`, `npm test -w apps/mobile`, `npm test -w tools/mobilis-seed`
- `npx expo export --platform ios`
- Uma rodada de verificação por tarefa, com o tempo de cada comando (`Measure-Command`).
- Ler arquivo grande por trecho (`rg`, `sed -n`), nunca inteiro.

## O que ler (roteador)
Sempre: este arquivo e o contrato. Depois, só o que o tipo de tarefa pede:

| Tarefa | Leia | Não leia |
|---|---|---|
| Tela, folha, texto | `DESIGN.md` (seções citadas), `docs/v1/regras/renderizacao.md`, skill da área | domínio, banco |
| Lógica ligada a componente | `docs/v1/regras/logica-em-componente.md` | — |
| Domínio | `docs/v0/fase-1-dominio.md` (seção citada) | `DESIGN.md` |
| Banco, backup, migração | `docs/v0/adr/ADR-0002-banco-local.md` | UX |
| Bug sem causa conhecida | `docs/v0/fase-6/regressoes.md` (busque o sintoma) | planos |
| Teste e2e (Maestro) | skill `notebus-maestro-e2e` | — |
| Revisão | contrato, diff, saída do gate, perfil em `.agents/agents/` | histórico |

Não leia: `docs/estado_diario_v1.md` (só o coordenador, só o BOOT), `docs/v0/ESTADO-ATUAL.md`, `docs/v0/diario.md`, `docs/referencias/`.

## Onde está cada coisa
Mapa completo: `docs/MAPA.md`. Atalhos:
- Decisões técnicas: `docs/v0/adr/`, `docs/v1/adr/`
- Estratégia de testes (camadas, mutação, o que só o iPhone prova): `docs/v0/estrategia-de-testes.md`
- Padrões já decididos (não reinventar): `NbSwitch`, `pressedStyle`, `hitSlopToMinTouch`, texto só no catálogo `pt-BR.ts`

## Ao compactar o contexto
Preserve: o contrato, a lista de arquivos mudados, as saídas de teste e as dúvidas abertas.

## Segunda via
Se o Claude estiver fora do ar, o protocolo está em `docs/v1/contingencia/LEIA-ME.md` (proposta P32, em teste no SPK-09). Em contingência você não decide, não toca área protegida e escreve nota de passagem.
