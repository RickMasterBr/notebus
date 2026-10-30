import { readSync } from 'node:fs';

// Escreve a pergunta no stderr e so entao le UMA linha do stdin, sem esperar o fim da entrada.
// Le byte a byte para nao consumir a linha da pergunta seguinte. Fim de entrada ou erro = '' (vale nao).
export const pergunta = (texto, fd = 0) => {
  process.stderr.write(texto);
  const bytes = [];
  const um = Buffer.alloc(1);
  for (;;) {
    let n;
    try {
      n = readSync(fd, um, 0, 1, null);
    } catch (e) {
      if (e.code === 'EAGAIN') {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
        continue;
      }
      break; // EOF (Windows) ou stdin ilegivel
    }
    if (n === 0 || um[0] === 10) break;
    bytes.push(um[0]);
  }
  return Buffer.from(bytes).toString('utf8').replace(/\r$/, '').trim();
};
