# Plano Jules 1/2: README do repositório do app (`RickMasterBr/notebus`)

Cole o bloco "Prompt para o Jules" numa sessão nova, com o repositório `notebus` selecionado, branch base `main`.

> [!IMPORTANT]
> Na máquina do Rick, `docs/` é uma **junction ignorada pelo git** (`.gitignore` linha 1). Jules clona o GitHub e **não vê `docs/`**. Por isso o prompt traz os fatos que ele precisa e manda confirmar o resto pelo código. Não mande o Jules ler `docs/`.

## Objetivo

Reescrever `README.md` da raiz para o estado **v0 concluída** (fim da E-09, MVP). O README atual é da época da E-01 e está desatualizado: diz que registrar passagem, "ir para X", avisos e mapa "não estão implementados".

## Escopo

| Pode | Não pode |
|---|---|
| Ler qualquer arquivo do repositório | Criar, editar, apagar, mover ou renomear **qualquer** arquivo, exceto `README.md` da raiz |
| Reescrever `README.md` da raiz (único arquivo editável) | Rodar instalação, testes, build ou qualquer comando que gere ou altere arquivo |
| | Commitar dado da MOBILIS (D-091); só dados inventados |
| | Push na `main`; abrir PR é ok |

## Prompt para o Jules

```text
Tarefa: reescrever o README.md da raiz do repositório NoteBus para refletir a versão v0 (MVP) concluída. CONTENÇÃO: você só LÊ o repositório. O único arquivo que você pode editar é README.md da raiz. Não crie, edite, apague, mova nem renomeie nenhum outro arquivo (nem código, testes, workflows, dependências, package-lock). Não rode npm ci, testes, build nem comando que gere ou altere arquivos; só comandos de leitura (ls, cat, grep, find, wc). Se achar erro ou algo a corrigir em outro arquivo, apenas relate no PR. Leia AGENTS.md e DESIGN.md antes. Não existe pasta docs/ neste clone; não cite caminhos dela.

Contexto (confirme cada item no código; se não achar, não afirme):
- App de caderno de horários de ônibus (MOBILIS, Leiria, Portugal), só iPhone, Expo SDK 57, React Native, TypeScript. Offline, SQLite local (expo-sqlite + Drizzle), sem servidor.
- Três ideias: Registrar (um toque anota quando o ônibus passou), Aprender (horário real esperado a partir dos registros), Decidir ("ir para X agora": "esteja no ponto às HH:MM").
- Monorepo npm workspaces: packages/domain (TS puro, Vitest), apps/mobile, tools/* (mobilis-seed, mvp-report). Veja packages/ e tools/ para o que existe de fato.
- Distribuição: CI gera .ipa sem assinatura (sideload via SideStore) e .apk como artefato. Veja .github/workflows (ios, android, test, e2e) e descreva só o que cada um faz.
- Testes e2e com Maestro em .maestro/.
- Os dados da MOBILIS nunca entram neste repositório público. Os exemplos são inventados.
- Pasta .agents/ e AGENTS.md/CLAUDE.md orientam agentes de código.

Passos:
1. Inventário. Liste apps/mobile/src/screens, sheets, data, db, notifications, i18n, theme, ui e deduza as funcionalidades reais. Leia package.json de cada workspace, app.config.ts, os workflows e .maestro/.
2. Números: sem executar nada, conte por leitura (por exemplo ind ... -name '*.test.ts' | wc -l) e diga que é contagem de arquivos de teste, não de testes passados. Não copie números de memória.
3. Escreva o README em pt-BR, sem emoji, com estas seções, nesta ordem:
   - Título + frase de uma linha + selo/estado "v0 (MVP) concluída"
   - O que é e por que existe (3 a 5 linhas; origem: anotar horários no WhatsApp em intercâmbio)
   - O que a v0 faz (lista curta, só o que existe no código: registrar passagem, horário esperado, ir para X com lugares e trajetos, aviso de saída por notificação local, mapa e localização, ajustes, backup/restauração em JSON, importação da semente, tema claro/escuro; confirme cada um)
   - O que fica fora da v0 (só o que o código realmente não tem; marque como "planejado", sem prometer data)
   - Como rodar (pré-requisitos, npm ci, comandos de typecheck/test, como iniciar o Expo, como instalar via SideStore a partir do artefato do CI)
   - Estrutura do repositório (árvore comentada, 1 linha por pasta)
   - Arquitetura em 6 a 10 linhas: domínio puro separado da UI; relógio lido em um só ponto; banco local com cópia de segurança antes de migração e modo leitura em caso de falha; folhas (bottom sheets) em pilha. Confirme no código antes de afirmar.
   - Testes e CI (contagem do passo 2, o que cada workflow faz)
   - Dados e privacidade (offline, sem conta, sem servidor; dados da MOBILIS fora do repo)
   - Trabalho com agentes (um parágrafo apontando AGENTS.md, CLAUDE.md, .agents/)
   - Licença: veja se há arquivo LICENSE; se não houver, escreva "a definir" e relate no PR.
4. Regras de estilo: frases curtas, sem marketing, nenhuma afirmação sem fonte no código. Onde não conseguir confirmar, escreva "TODO: confirmar" e liste todos os TODO no corpo do PR.
5. Confira que todo link relativo do README aponta para arquivo que existe, e que todo comando citado existe em algum package.json.
6. Branch docs/readme-v0, um commit "README: reescrita para a v0", abra PR contra main. No PR: tabela "afirmação do README → arquivo que comprova", lista de TODO, e "nada fora do pedido" (ou o que mudou fora).
```

## Critérios de aceite (o Rick confere)

- [ ] Só `README.md` da raiz no diff (`git diff --stat` mostra 1 arquivo).
- [ ] Nenhuma funcionalidade listada sem arquivo que a comprove na tabela do PR.
- [ ] Números de testes são contagem de arquivos e dizem isso.
- [ ] Nenhum horário, parada ou linha real da MOBILIS no texto.
- [ ] Nenhum link para `docs/`; link para o repo de docs só como URL absoluta (Plano 2).
- [ ] Sem emoji; pt-BR.

## Riscos

- Jules "completar" funcionalidade por inferência: mitigado pela exigência de tabela afirmação→arquivo.
- Jules não executa nada: sem risco de ambiente, mas sem números de testes passados.
- Quando o repo de docs tiver README novo, voltar e colocar a URL dele na seção de documentação (passo manual do Rick).

