import { appendFileSync, existsSync, writeFileSync } from 'node:fs';

// Gate de teste: registra argv, cwd e se o relatorio e a trava existem; sai com GATE_FALSO_CODIGO (0 por padrao).
// GATE_FALSO_LOG (obrigatorio), GATE_FALSO_RELATORIO, GATE_FALSO_TRAVA, GATE_FALSO_PID e GATE_FALSO_DORME=1 (nao termina).
const { GATE_FALSO_LOG, GATE_FALSO_RELATORIO, GATE_FALSO_TRAVA, GATE_FALSO_PID, GATE_FALSO_DORME, GATE_FALSO_CODIGO } = process.env;
appendFileSync(GATE_FALSO_LOG, `${JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), relatorio: existsSync(GATE_FALSO_RELATORIO ?? ''), trava: existsSync(GATE_FALSO_TRAVA ?? '') })}\n`);
if (GATE_FALSO_PID) writeFileSync(GATE_FALSO_PID, String(process.pid));
if (GATE_FALSO_DORME) setInterval(() => {}, 1000);
else process.exit(Number(GATE_FALSO_CODIGO ?? 0));
