# NoteBus — regras para o agente

App pessoal de caderno de horários de ônibus (MOBILIS, Leiria). iPhone primeiro, Expo. O dono é o Rick: ele decide, você executa o plano.

## Onde está tudo

- Código: este repositório (`RickMasterBr/notebus`, **público**).
- Documentação: repositório privado `RickMasterBr/notebus-docs`, clonado em `docs/` (ignorado pelo git deste repositório).
  - Se `docs/` não existir: `git clone https://github.com/RickMasterBr/notebus-docs.git docs`
- Commits de documentação vão para o repositório `docs/`, não para este.

## Toda sessão começa assim

1. Ler **só** o bloco de inicialização de `docs/estado_diario_v1.md` (entre `<!-- BOOT_START -->` e `<!-- BOOT_END -->`; ex.: `sed -n '/^<!-- BOOT_START -->/,/^<!-- BOOT_END -->/p' docs/estado_diario_v1.md`). Não ler esse arquivo inteiro nem os V0 congelados (`docs/v0/ESTADO-ATUAL.md`, `docs/v0/diario.md`).
2. Ler o plano da etapa em curso: `docs/v0/planos/E-xx-*.md`.
3. Ler o prompt do bloco: `docs/v0/fase-6/prompts/E-xx-bloco-N.md`.
4. Ler `docs/banco-de-ideias-distribuicao.md` e listar as ideias cujo destino é a etapa em curso. Cada uma entra no plano ou fica fora com o motivo. Ideia nova vai para `docs/banco-de-ideias.md`, nunca direto para o código.
5. Antes de mexer em tela, folha ou texto, ler `DESIGN.md` (raiz do repositório `notebus`): tokens, quadro das folhas, textos, vocabulário. Regra do `DESIGN.md` que contradiga o plano ou uma decisão: **pare e pergunte**.
6. Abrir outros documentos **só quando o plano citar e só a seção citada**. Não ler a pasta inteira: custa caro.

## Regras

1. **O plano manda.** Se algo não está no plano, não faça: pare e pergunte. Decisão nova vira questão `Q-xx` (próximo número em `docs/v0/planos/README.md`) e espera o Rick.
2. **Minimalismo sim, mas o plano não é "código desnecessário".** O que o plano pede (esquema completo, cópia antes de migrar, validação V1–V8, chaves i18n desde já, tokens de tema) entra mesmo que pareça cedo. Fora disso, o mínimo que funciona.
3. **Nenhum componente visual sem especificação.** Antes de criar uma tela ou componente, aponte a fonte: `docs/v0/ux/4.4-design-system.md`, `docs/v0/ux/4.5-alta-fidelidade.md` ou o canvas em `docs/v0/ux/alta-fidelidade/`. Se não houver especificação, **pare e pergunte**; não invente aparência. Nada de biblioteca de UI pronta sem aprovação.
4. **GitHub:** commit e push nos dois repositórios estão liberados. Qualquer outra coisa (criar ou apagar repositório, mudar configuração, secrets, releases, tornar algo público, force-push, apagar branch) **explique e espere o ok**. Tags só quando o prompt do bloco pedir.
5. **Dados da MOBILIS e dados pessoais nunca vão para este repositório** (D-091). Aqui só código, exemplo inventado e trechos pequenos para teste.
6. Versões fixadas (sem `^` nem `~`) para Expo, drizzle-orm, drizzle-kit e expo-sqlite.
7. Commit sempre começa pela etapa ou decisão: `E-01: …`, `D-084: …`.
8. Escreva para o Rick em português, curto, com exemplo antes do termo técnico.

## Stack (decidida, não rediscutir)

Expo SDK 57 + TypeScript estrito · npm workspaces (sem Turborepo) · `packages/domain` em TypeScript puro (sem React, sem banco) · expo-sqlite + Drizzle · Vitest · Maestro (E-09) · GitHub Actions · date-holidays · MapLibre + OpenFreeMap (E-07). Fontes: `docs/v0/adr/`.

**Plugins e skills:** se algum plugin ou skill instalado mandar outra estrutura (Turborepo, `packages/core-*`, `packages/feature-*`, outro gerenciador de pacotes), ele perde para este arquivo. **Avise o Rick na primeira resposta da sessão** para ele desligar.

## Fim de cada bloco

1. Rodar typecheck e testes; só dizer "pronto" com a saída na mão.
2. Atualizar o snapshot (bloco BOOT) e acrescentar a entrada da sessão ao diário em `docs/estado_diario_v1.md`, seguindo `docs/INSTRUCOES-AGENTE-V1.md`. Commit e push no `docs/`.
3. Responder ao Rick neste formato:
   - **Feito:** o que existe agora (arquivos principais).
   - **Verificado:** comandos rodados e resultado.
   - **Para você testar:** passos exatos, se houver.
   - **Dúvidas/desvios do plano:** ou "nenhum".
   - Última linha: **"Bloco N concluído. Abra uma sessão nova para o bloco seguinte."**

## Multiagente (Antigravity)

O Rick usa o Antigravity em três modos: agente normal, /boost e /teamwork. Quem escolhe o modo é a coordenação (chat), e o Rick confirma. Regras, orçamento e modelo de prompt: `docs/v0/ai/modos-de-execucao.md`. Mapa de leitura barata: `docs/v0/ai/mapa-para-agentes.md`.
