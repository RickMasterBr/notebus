# NoteBus

Caderno pessoal de horários de ônibus (MOBILIS, Leiria). iPhone primeiro, feito com Expo.

Os dados da MOBILIS não estão aqui; o app os importa de um arquivo gerado por `tools/mobilis-seed` a partir de dados mantidos à parte.

## Estrutura

- `packages/domain` — regras em TypeScript puro (sem React, sem banco)
- `apps/mobile` — app Expo
- `tools/mobilis-seed` — gera e valida o arquivo da MOBILIS

## Como rodar

```
npm ci
npm run typecheck
npm test
npm run start --workspace apps/mobile   # abre o Expo
```
