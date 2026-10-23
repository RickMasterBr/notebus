import { relatorio, commitaArquivo, gravaRelatorio } from './harness-base.mjs';

commitaArquivo();
gravaRelatorio(relatorio());
console.log('texto livre do opencode');
