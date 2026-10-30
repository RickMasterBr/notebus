import { relatorio, commitaArquivo } from './harness-base.mjs';

commitaArquivo();
console.log(JSON.stringify({ type: 'result', is_error: false, num_turns: 3, total_cost_usd: 0.5, session_id: 's', structured_output: relatorio(), usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40, output_tokens_details: { thinking_tokens: 5 } } }));
