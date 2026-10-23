import { writeFileSync } from 'node:fs';

writeFileSync(process.env.PID_ARQUIVO, String(process.pid));
setInterval(() => {}, 1000);
