# NoteBus
Caderno pessoal e offline de horários de ônibus.
**Estado: v0 (MVP) concluída**

## O que é e por que existe
O NoteBus nasceu da necessidade de gerenciar horários de transporte público durante um intercâmbio em Leiria (Portugal). Inicialmente, o controle era feito através de anotações manuais no WhatsApp para saber a que horas o autor deveria ir ao ponto de ônibus nas semanas seguintes. Devido às imprecisões, dificuldade de edição e falta de flexibilidade dos aplicativos de transporte padrão, o NoteBus foi desenvolvido para automatizar esse caderno de rotinas, focado em registrar passagens e prever a chegada em um ambiente totalmente offline.

## O que a v0 faz
Esta versão MVP (v0) está completamente implementada e realiza o fluxo central do aplicativo:
- **Registrar passagem:** anota o horário real exato em que um ônibus passa pelo ponto, através de um clique rápido ou rascunho de registro.
- **Horário esperado:** calcula e exibe a expectativa real de chegada com base no histórico dos registros de passagem do usuário.
- **Ir para X:** oferece um fluxo de decisão e roteamento baseado em locais salvos, sugerindo em quais trajetos embarcar com a métrica "esteja no ponto às HH:MM".
- **Aviso de saída:** agenda e dispara notificações locais nativas avisando a hora de caminhar até o ponto de ônibus.
- **Mapa e localização:** renderiza a cartografia da cidade (via MapLibre nativo), processa o GPS do dispositivo e localiza o usuário para exibir o mapa e paradas próximas.
- **Ajustes:** configurações e preferências de uso do aplicativo, como gerenciar relógio de teste e margens.
- **Backup e Restauração em JSON:** permite exportar todos os registros, históricos e lugares salvos para um arquivo legível e realizar importações incrementais seguras.
- **Importação da semente:** módulo que carrega pacotes predefinidos (JSON gerado à parte) contendo linhas, paradas e calendário base da rede de transporte.
- **Tema claro e escuro:** suporte visual fluído que respeita o estilo definido nativamente no sistema do dispositivo.

## O que fica fora da v0
As seguintes funcionalidades não estão no escopo da base do código atual e constam apenas como passos do roteiro futuro:
- Versão Web (planejado)
- Versão consolidada do aplicativo para usuários do sistema Android (planejado)
- Compartilhamento comunitário de dados entre vários aparelhos (planejado)

## Como rodar
O projeto é baseado em um monorepo npm.
**Pré-requisitos:** Node.js (versão 22) e npm.

1. **Instalar dependências (raiz do projeto):**
   ```bash
   npm ci
   ```
2. **Checagem estática de tipos (typecheck):**
   ```bash
   npm run typecheck
   ```
3. **Execução de testes:**
   ```bash
   npm run test
   ```
4. **Iniciar o aplicativo Expo:**
   ```bash
   npm run start --workspace @notebus/mobile
   ```
5. **Instalação no iPhone via SideStore:**
   O CI constrói ativamente um pacote não assinado. Faça download do `.ipa` em "Actions" e instale localmente na aplicação SideStore do seu iPhone.

## Estrutura do repositório
A árvore segue uma divisão clara entre os pacotes do monorepo:
- `apps/mobile/` — Código fonte completo do aplicativo UI escrito em React Native e Expo SDK 57.
- `packages/domain/` — Domínio da aplicação: lógicas de roteamento, previsão de tempo, e testes em TypeScript puro, isolados de UI.
- `tools/mobilis-seed/` — Ferramenta dedicada para forjar e formatar a semente inicial estruturada com dados das vias.
- `tools/mvp-report/` — Utilitário de leitura e consolidação de relatórios do MVP.
- `tools/licenses/` — Utilitário analítico para extração de pacotes e licenças aplicadas.
- `.github/workflows/` — Definições das automações de entrega contínua (Android, iOS, Testes, e2e).
- `.maestro/` — Rotinas de teste de interface end-to-end do aplicativo emulador iOS.
- `.agents/` — Manuais de procedimentos e referências para auxílio por Inteligência Artificial.

## Arquitetura
O NoteBus preserva rigorosamente a independência entre interface (React Native) e regras de negócio (`packages/domain`), que são desenvolvidas e testadas como código TypeScript puro em seu próprio pacote. No aplicativo móvel, a leitura do relógio é unificada em um único ponto para garantir sincronia constante durante a execução e reprodutibilidade nos testes de regressão. Os dados de persistência localizam-se num servidor SQLite nativo via `expo-sqlite` emparelhado ao Drizzle ORM. As atualizações estruturais desse banco têm um sistema avançado de "modo leitura" para contingência: em caso de falha de esquema, um dump prévio bloqueia falhas irrecuperáveis e garante que os registros do usuário não desapareçam nas atualizações. Do ponto de vista de navegação de telas, adotou-se o modelo de "bottom sheets" onde pilhas de painéis inferiores emergem para exibir formulários, horários e mapas, abolindo o stack padrão por camadas mais tangíveis.

## Testes e CI
O monorepo abriga a quantia de **349 arquivos de teste** para assegurar a fundação (este número representa a contagem literal de arquivos, e não de asserts/tests passados individualmente). As verificações ocorrem continuamente através de quatro workflows no GitHub Actions:
- **test.yml:** Acionado em requisições de revisão, efetua checagem de tipos em todos os workspaces, executa os testes do Vitest e valida estritamente a integridade entre o código e a estrutura recém gerada do banco (migrações).
- **ios.yml:** Fluxo encarregado de rodar compilação sem assinatura no Xcode macOS para forjar o `.ipa` requerido pelo sideload. Suporta compilação isolada para "build dev" e testagem forçada de cenários de contingência do banco.
- **android.yml:** Fluxo para rastreabilidade paralela construindo em Ubuntu uma APK Android mantida unicamente como artefato para a verificação de sanidade do prebuild Expo.
- **e2e.yml:** Um conjunto reservado e invocado manualmente encarregado de disparar as métricas visuais do Maestro no simulador iOS offline, varrendo capturas de interface e aferindo estabilidade via Dynamic Type em 5 tamanhos escalados.

## Dados e Privacidade
Toda a execução do NoteBus ocorre sob arquitetura offline e focada no aparelho, sem intermédio nem configuração de servidores externos. Os dados produzidos habitam unicamente o SQLite do usuário. Para assegurar total desassociação institucional em repositórios abertos, a operadora real da infraestrutura de Leiria (MOBILIS) não possui horários e itinerários mantidos como fonte de verdade neste código; logo, os testes, as sementes da engine do NoteBus, a construção de mapas em MapLibre e roteiros diários demonstram exclusivamente dados de exemplo fictícios ou anonimizados.

## Trabalho com agentes
A engenharia desta base tem acoplamento otimizado para o trabalho paralelo com agentes de código autônomo (LLMs). As convenções rigorosas sobre padronização de arquitetura, prioridade na formatação de UUIDs nativos em domínios de tempo, tipagem e organização UI residem descritas ativamente na listagem da pasta `.agents/` associada aos arquivos de coordenação `AGENTS.md` e `CLAUDE.md`.

## Licença
A definir.
