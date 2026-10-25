import { appendFileSync } from 'node:fs';

// Dispatch de teste: grava argv em RODAR_FALSO_LOG (JSON por linha) e sai com RODAR_FALSO_CODIGO (0 por padrao).
appendFileSync(process.env.RODAR_FALSO_LOG, `${JSON.stringify(process.argv.slice(2))}\n`);
process.exit(Number(process.env.RODAR_FALSO_CODIGO ?? 0));
