# NoteBus

## Visão Geral e Motivação
O **NoteBus** é um caderno pessoal de horários de ônibus. O projeto nasceu da necessidade de gerenciar horários de transporte em intercâmbio em Leiria (Portugal). Inicialmente, o controle era feito através de anotações no WhatsApp para saber a que horas ir ao ponto nas semanas seguintes, devido às imprecisões e falta de edição dos aplicativos de transporte padrão.

O NoteBus transforma essa necessidade em um aplicativo focado em três camadas:
1. **Registrar:** Com um toque, registrar o momento exato em que o ônibus passou.
2. **Aprender:** Calcular o horário real esperado a partir do histórico de registros.
3. **Decidir:** Responder à pergunta "quero ir para X agora, qual a melhor opção", focando na instrução "esteja no ponto às HH:MM".

## Estado Atual
O projeto concluiu o planejamento (Fases 0 a 5) e a etapa de fundação técnica (E-01). A base do aplicativo, incluindo configuração de banco de dados, migrações seguras, esquema de cores/tema e importador de dados via JSON estão prontos.
As funcionalidades de produto finais (como "registrar passagem", "horário esperado", "ir para X" e "avisos") são etapas futuras e **não** estão implementadas no momento. Estão presentes apenas no roteiro. A validação em um iPhone físico é a próxima etapa imediata.

## Stack e Tecnologias
O projeto adota uma arquitetura de monorepo (usando npm workspaces) contendo os seguintes módulos e tecnologias:
- **Linguagem:** TypeScript
- **App (Mobile):** React Native com Expo (SDK 57)
- **Banco de Dados (Mobile):** Drizzle ORM e expo-sqlite (SQLite local)
- **Testes:** Vitest (para domínio) e Maestro (para fluxos - TODO: confirmar implementação de testes Maestro no código base)
- **CI/CD:** GitHub Actions para compilação (iOS sem assinatura e Android .apk) e execução de testes.

## Decisões Técnicas
- **Independência de Interface:** As regras de negócio (domínio) vivem em um pacote TypeScript puro (`packages/domain`), independente do app (UI/React).
- **Banco Local e Offline:** O aplicativo funciona totalmente offline. O banco de dados é SQLite (via `expo-sqlite` e Drizzle), sem a necessidade de um servidor de backend. Seus dados ficam armazenados localmente no seu aparelho.
- **Migrações Seguras:** Há uma estrutura implementada para cópia de segurança antes de aplicar migrações e rollback para um "modo leitura" em caso de falha.
- **Notificações:** O app terá notificações locais agendadas para avisos de saída, e incluirá um botão para registrar o embarque diretamente pela notificação (funcionalidade futura).
- **Mapas:** Futuramente haverá integração com MapLibre e tiles do OpenFreeMap.
- **Distribuição (Mobile):** 
  - *iOS:* Distribuído por sideload via SideStore (o GitHub Actions gera um `.ipa` não assinado, sendo assinado no aparelho).
  - *Android:* O CI compila um arquivo `.apk` desde o início (apenas como artefato gerado no CI).
  - *Web:* Planejado para o futuro.
- **Backup e Restauração:** O backup é feito através de um arquivo JSON de formato legível. A importação une os registros sem sobrepor destrutivamente.

## Estrutura do Repositório
A organização principal do repositório reflete os workspaces configurados:
- `apps/mobile/` — Código do aplicativo, utilizando Expo e React Native. Inclui as lógicas de banco (migrations, queries Drizzle), UI (telas, componentes, i18n, e temas claro/escuro).
- `packages/domain/` — Domínio e regras em TypeScript puro (IDs, validações, formatos de semente e regras de tempo), testados de forma isolada com Vitest.
- `tools/mobilis-seed/` — Ferramenta para gerar e validar o arquivo inicial de dados (semente) consumido pelo aplicativo.
- `.github/workflows/` — Workflows de CI do GitHub Actions (`ios.yml`, `android.yml`, `test.yml`).

## Pré-requisitos
- Node.js (versão 22)
- npm

## Como Rodar Localmente

1. **Instalação das dependências (na raiz):**
```bash
npm ci
```

2. **Validação de tipos em todo o projeto:**
```bash
npm run typecheck
```

3. **Rodar os testes em todo o projeto:**
```bash
npm run test
```

4. **Para iniciar o App (Expo):**
```bash
npm run start --workspace @notebus/mobile
```

5. **Para gerar migrações do banco (App Mobile):**
```bash
npm run db:generate --workspace @notebus/mobile
```

*Nota: Em workflows (`.github/workflows/ios.yml`) é utilizada a variável de ambiente `EXPO_PUBLIC_NOTEBUS_TEST_MIGRATION` (`nenhuma`, `add_column`, `fail`) para testes de resiliência das migrações do banco.*

## Roteiro (Roadmap)
1. **MVP:** Foco no caderno pessoal com usabilidade voltada para o autor, focando apenas no iPhone.
2. **v1:** O app atuando como um sistema inteligente solo, providenciando rastreio dos horários, calculando tempo de caminhada até o ponto e sugestões de rotas otimizadas.
3. **v2:** Abertura para uso comunitário: versão Web, versão consolidada no Android e mecanismos para compartilhamento de dados/dados de rede.
4. **Futuro:** Expansão de ferramentas.

## Observações sobre os Dados
Os dados pessoais (histórico e roteiro diário do autor) e a documentação completa de planejamento vivem isolados em um repositório privado separado. 
Além disso, **os dados operacionais reais da rede de ônibus da operadora (MOBILIS) não fazem parte deste repositório público**.

Qualquer menção ou dado inserido em testes, *seeds* e demonstrações neste repositório será composto apenas por exemplos fictícios. Nenhum dado sensível de uso particular faz parte do escopo público do **NoteBus**.
