# NoteBus

## Visão Geral
NoteBus é um caderno pessoal de horários de ônibus focado na rede MOBILIS (Leiria). É um aplicativo com prioridade para a plataforma iPhone (iOS), desenvolvido utilizando o framework Expo. Os dados operacionais da MOBILIS não estão embutidos diretamente no código; o aplicativo importa esses dados a partir de um arquivo gerado pela ferramenta interna `mobilis-seed`.

## Stack e Tecnologias
O projeto adota uma arquitetura de monorepo (utilizando npm workspaces) e utiliza as seguintes tecnologias principais:
- **Linguagem:** TypeScript
- **Mobile:** React, React Native e Expo
- **Banco de Dados (Mobile):** Drizzle ORM e expo-sqlite
- **Testes:** Vitest

## Estrutura de Pastas
O repositório está dividido nos seguintes módulos principais:
- `apps/mobile/` — Código fonte do aplicativo móvel construído com Expo.
- `packages/domain/` — Regras de negócio essenciais em TypeScript puro, isoladas de frameworks de UI (React) e de bancos de dados.
- `tools/mobilis-seed/` — Ferramenta em Node.js responsável por gerar e validar o arquivo de dados da MOBILIS, utilizando dados mantidos separadamente.

## Pré-requisitos
- Node.js (TODO: confirmar versão exata necessária)
- npm

## Instalação e Execução Local

1. Instale as dependências na raiz do repositório:
```bash
npm ci
```

2. Para verificar a tipagem (typecheck) em todos os pacotes:
```bash
npm run typecheck
```

3. Para rodar os testes utilizando o Vitest:
```bash
npm run test
```

4. Para iniciar o aplicativo móvel (inicia o servidor do Expo):
```bash
npm run start --workspace @notebus/mobile
```
*(Você também pode utilizar os comandos específicos do workspace do mobile, como `npm run ios` ou `npm run android` a partir do diretório `apps/mobile`, ou rodando com `--workspace @notebus/mobile`).*

5. Para gerar as migrações de banco de dados (no app mobile):
```bash
npm run db:generate --workspace @notebus/mobile
```

## Variáveis de Ambiente
As seguintes variáveis de ambiente são utilizadas no projeto:
- `EXPO_PUBLIC_NOTEBUS_TEST_MIGRATION`

## Build e Deploy
TODO: confirmar. (Atualmente não há scripts explícitos de build final ou deploy para lojas de aplicativos configurados no `package.json`).

## Principais Funcionalidades
- Visualização e consulta de horários de ônibus da rede MOBILIS. (TODO: confirmar fluxo completo).
- Importação de arquivo de dados da MOBILIS.
- Persistência de dados localmente utilizando SQLite.
