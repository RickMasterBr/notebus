# NoteBus: Caderno Pessoal de Ônibus
v0 (MVP) concluída

## O que é e por que existe
O NoteBus nasceu para substituir anotações manuais no WhatsApp durante um intercâmbio. Ele é um aplicativo focado em permitir que o autor registre quando o ônibus passou e saiba rapidamente a que horas deve estar no ponto nos próximos dias.

## O que a v0 faz
- **Registrar passagem:** anota o horário real em que o ônibus passou no ponto.
- **Horário esperado:** calcula e exibe a expectativa com base nos registros passados.
- **Ir para X:** seleção de locais salvos e apresentação das opções de trajetos.
- **Aviso de saída:** notificações locais agendadas para alertar o horário de sair.
- **Mapa e localização:** mapa offline com suporte à localização do usuário.
- **Ajustes:** configurações gerais do aplicativo.
- **Backup e Restauração:** exportação e importação de dados em formato JSON.
- **Importação da semente:** carrega dados iniciais de um arquivo gerado separadamente.
- **Tema:** suporte a tema claro e escuro.

## O que fica fora da v0
- Versão Web (planejado)
- Compartilhamento em rede/comunitário (planejado)
- Sideload para Android publicado fora do CI (planejado)

## Como rodar
**Pré-requisitos:** Node.js (versão 22) e npm.
- `npm ci` para instalar as dependências.
- `npm run typecheck` para validação de tipos em todo o projeto.
- `npm run test` para rodar os testes.
- `npm run start --workspace @notebus/mobile` para iniciar o Expo.
- Para instalar no iOS, utilize a compilação gerada pelo CI e instale via SideStore.

## Estrutura do repositório
- `apps/mobile/` — Código do aplicativo (Expo/React Native).
- `packages/domain/` — Domínio e regras de negócio em TypeScript puro.
- `tools/mobilis-seed/` — Ferramenta para gerar a semente inicial de dados.

## Arquitetura
O NoteBus separa a interface da regra de negócio. O domínio (`packages/domain`) é escrito em TypeScript puro e independe de frameworks visuais. O relógio e o controle de tempo são lidos em um único ponto para garantir consistência em testes e produção. O armazenamento é local, usando SQLite via expo-sqlite e Drizzle, com um sistema de proteção (cópia de segurança) para migrações do banco de dados, ativando um modo leitura em caso de falha. A navegação baseia-se numa pilha de folhas (bottom sheets) que se sobrepõem.

## Testes e CI
O projeto conta com 349 arquivos de teste (esta contagem refere-se a arquivos e não ao número de testes unitários passados).
Existem workflows configurados no GitHub Actions:
- **ios:** Compila um `.ipa` sem assinatura para distribuição via SideStore no iOS.
- **android:** Gera um arquivo `.apk` como artefato para fins de verificação.
- **test:** Executa verificação de tipos, roda os testes base e confirma se a geração das migrações não produz alterações não commitadas.
- **e2e:** Executa testes guiados por interface (Maestro) e gera capturas do Dynamic Type num simulador iOS.

## Dados e Privacidade
O aplicativo é totalmente offline e não requer criação de conta; os dados ficam armazenados exclusivamente no dispositivo sem envio para servidores externos. Todos os dados originais da rede MOBILIS são mantidos fora do repositório público, e apenas exemplos fictícios são usados no código para testes.

## Trabalho com Agentes
O desenvolvimento assistido por agentes de IA é orientado pelos arquivos localizados na pasta `.agents/` e pelas instruções nos arquivos `AGENTS.md` e `CLAUDE.md`. Eles detalham as regras do projeto, padrões de código e diretrizes comportamentais na interação com o código do NoteBus.

## Licença
A definir.
