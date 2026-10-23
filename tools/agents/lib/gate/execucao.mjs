import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FALHA = /fail|error|✗|×|not ok|erro/i;
// o pwsh em pt-BR grava em codepage do console: o acento vira lixo, entao 'n..o ... reconhecido' tolera ate 3 caracteres no lugar das letras
const NAO_ACHADO = /is not recognized|n.{0,3}o (?:foi |.{1,3} )?reconhecido|command not found/i;

// so as linhas de falha e a ultima linha (ideia 81); a saida inteira fica no arquivo
const resumir = (texto, codigo) => {
  const linhas = texto.split(/\r?\n/);
  const ultima = linhas.findLast((l) => l.trim()) ?? '';
  if (codigo === 0) return ultima.slice(0, 200);
  const falhas = linhas.filter((l) => FALHA.test(l)).slice(0, 20);
  return (falhas.includes(ultima) ? falhas : [...falhas, ultima]).filter(Boolean).join('\n');
};

// Windows: taskkill na arvore (o pwsh deixa o node como neto); fora dele: grupo de processos
const matar = (pid, plataforma) => {
  if (plataforma === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {}
  }
};

// roda um comando na pista; stdout e stderr juntos em saidaArquivo
export const executar = ({ comando, pista, saidaArquivo, tempoLimiteS, plataforma = process.platform }) =>
  new Promise((resolve) => {
    mkdirSync(path.dirname(saidaArquivo), { recursive: true });
    const fd = openSync(saidaArquivo, 'w');
    const win = plataforma === 'win32';
    const [programa, args] = win ? ['pwsh', ['-NoProfile', '-NonInteractive', '-Command', comando]] : ['sh', ['-c', comando]];
    const inicio = performance.now();
    let status = 'concluido';
    let pronto = false;
    let timer;
    const fim = (codigo) => {
      if (pronto) return;
      pronto = true;
      clearTimeout(timer);
      closeSync(fd);
      let texto = '';
      try {
        texto = readFileSync(saidaArquivo, 'utf8');
      } catch {}
      const token = comando.trim().split(/\s+/)[0];
      if (status === 'concluido' && (NAO_ACHADO.test(texto) || codigo === 127) && texto.includes(token)) status = 'ferramenta_ausente';
      // o codigo de um filho morto pelo gate (taskkill devolve 1) nao diz nada sobre o comando
      resolve({ codigo_saida: status === 'sem_tempo' ? null : codigo, duracao_s: (performance.now() - inicio) / 1000, resumo: resumir(texto, codigo), status });
    };
    let filho;
    try {
      filho = spawn(programa, args, { cwd: pista, stdio: ['ignore', fd, fd], detached: !win, windowsHide: true });
    } catch (e) {
      status = 'ferramenta_ausente';
      return fim(null);
    }
    filho.on('error', (e) => {
      status = e.code === 'ENOENT' ? 'ferramenta_ausente' : 'erro';
      fim(null);
    });
    filho.on('close', (codigo) => fim(codigo));
    timer = setTimeout(() => {
      status = 'sem_tempo';
      matar(filho.pid, plataforma);
    }, tempoLimiteS * 1000);
  });
