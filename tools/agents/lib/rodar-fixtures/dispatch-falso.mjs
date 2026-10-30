import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Dispatch de teste: grava argv em RODAR_FALSO_LOG (JSON por linha) e sai com RODAR_FALSO_CODIGO (0 por padrao).
// Com RODAR_FALSO_GRAVA=1 cria _despacho/<id>/meta.json (duracao_s 4242) e relatorio.json na --raiz, como o despacho real faria.
const args = process.argv.slice(2);
appendFileSync(process.env.RODAR_FALSO_LOG, `${JSON.stringify(args)}\n`);
if (process.env.RODAR_FALSO_GRAVA === '1') {
  const id = path.basename(args[0], '.md');
  const dir = path.join(args[args.indexOf('--raiz') + 1], '_despacho', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id, harness: 'claude', inicio: '2026-01-01T10:00:00Z', fim: '2026-01-01T10:05:00Z', duracao_s: 4242 }));
  writeFileSync(path.join(dir, 'relatorio.json'), JSON.stringify({ tarefa: id, resultado: 'ok', arquivos_mudados: ['feito.txt'], comandos: [] }));
}
process.exit(Number(process.env.RODAR_FALSO_CODIGO ?? 0));
