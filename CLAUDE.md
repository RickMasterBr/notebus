# NoteBus — regras para o agente

App pessoal de caderno de horários de ônibus (MOBILIS, Leiria). iPhone primeiro, Expo. O dono é o Rick: ele decide, você executa o plano.

## Onde está tudo

- Código: este repositório (`RickMasterBr/notebus`, **público**).
- Documentação: repositório privado `RickMasterBr/notebus-docs`, clonado em `docs/` (ignorado pelo git deste repositório).
  - Se `docs/` não existir: `git clone https://github.com/RickMasterBr/notebus-docs.git docs`
- Commits de documentação vão para o repositório `docs/`, não para este.

## Toda sessão começa assim

1. Ler `docs/ESTADO-ATUAL.md` (só a parte "Onde paramos" e "Próximos passos").
2. Ler o plano da etapa em curso: `docs/planos/E-xx-*.md`.
3. Ler o prompt do bloco: `docs/fase-6/prompts/E-xx-bloco-N.md`.
4. Abrir outros documentos **só quando o plano citar e só a seção citada**. Não ler a pasta inteira: custa caro.

## Regras

1. **O plano manda.** Se algo não está no plano, não faça: pare e pergunte. Decisão nova vira questão `Q-xx` (próximo número em `docs/planos/README.md`) e espera o Rick.
2. **Minimalismo sim, mas o plano não é "código desnecessário".** O que o plano pede (esquema completo, cópia antes de migrar, validação V1–V8, chaves i18n desde já, tokens de tema) entra mesmo que pareça cedo. Fora disso, o mínimo que funciona.
3. **Nenhum componente visual sem especificação.** Antes de criar uma tela ou componente, aponte a fonte: `docs/ux/4.4-design-system.md`, `docs/ux/4.5-alta-fidelidade.md` ou o canvas em `docs/ux/alta-fidelidade/`. Se não houver especificação, **pare e pergunte**; não invente aparência. Nada de biblioteca de UI pronta sem aprovação.
4. **GitHub:** commit e push nos dois repositórios estão liberados. Qualquer outra coisa (criar ou apagar repositório, mudar configuração, secrets, releases, tornar algo público, force-push, apagar branch) **explique e espere o ok**. Tags só quando o prompt do bloco pedir.
5. **Dados da MOBILIS e dados pessoais nunca vão para este repositório** (D-091). Aqui só código, exemplo inventado e trechos pequenos para teste.
6. Versões fixadas (sem `^` nem `~`) para Expo, drizzle-orm, drizzle-kit e expo-sqlite.
7. Commit sempre começa pela etapa ou decisão: `E-01: …`, `D-084: …`.
8. Escreva para o Rick em português, curto, com exemplo antes do termo técnico.

## Stack (decidida, não rediscutir)

Expo SDK 57 + TypeScript estrito · npm workspaces (sem Turborepo) · `packages/domain` em TypeScript puro (sem React, sem banco) · expo-sqlite + Drizzle · Vitest · Maestro (E-09) · GitHub Actions · date-holidays · MapLibre + OpenFreeMap (E-07). Fontes: `docs/adr/`.

**Plugins e skills:** se algum plugin ou skill instalado mandar outra estrutura (Turborepo, `packages/core-*`, `packages/feature-*`, outro gerenciador de pacotes), ele perde para este arquivo. **Avise o Rick na primeira resposta da sessão** para ele desligar.

## Fim de cada bloco

1. Rodar typecheck e testes; só dizer "pronto" com a saída na mão.
2. Atualizar `docs/ESTADO-ATUAL.md`: uma linha em "Onde paramos" e o próximo passo. Commit e push no `docs/`.
3. Responder ao Rick neste formato:
   - **Feito:** o que existe agora (arquivos principais).
   - **Verificado:** comandos rodados e resultado.
   - **Para você testar:** passos exatos, se houver.
   - **Dúvidas/desvios do plano:** ou "nenhum".
   - Última linha: **"Bloco N concluído. Abra uma sessão nova para o bloco seguinte."**
