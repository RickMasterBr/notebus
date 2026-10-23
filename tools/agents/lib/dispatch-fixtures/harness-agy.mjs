import { relatorio, commitaArquivo } from './harness-base.mjs';

commitaArquivo();
console.log(JSON.stringify({ conversation_id: 'x', status: 'SUCCESS', response: JSON.stringify(relatorio()) }));
