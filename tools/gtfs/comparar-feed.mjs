// comparar-feed: compara um feed GTFS novo com o vigente e diz o que mudou.
// Uso: node comparar-feed.mjs <pasta vigente> <pasta nova>
// So le as duas pastas; nunca escreve. Sai com 0 (iguais), 1 (ha mudancas) ou 2 (erro).
import { lerFeed, GtfsErro } from './lib/gtfs.mjs';
import { compararFeeds, formatarRelatorio } from './lib/comparar.mjs';

// toda saida e ASCII: o PowerShell do Rick mostra acento mal
const ascii = (s) => String(s).replace(/[^\x00-\x7F]/g, '?');

const falha = (codigo, texto) => {
  console.error(ascii(`FALHA ${codigo} ${texto}`));
  process.exitCode = 2;
};

const principal = (args) => {
  if (args.length !== 2) {
    falha('USO', 'uso: comparar-feed <pasta vigente> <pasta nova>');
    return;
  }
  const feeds = [];
  for (const pasta of args) {
    try {
      feeds.push(lerFeed(pasta));
    } catch (e) {
      const motivo = e instanceof GtfsErro ? e.message : `${e.code ?? e.name}: ${e.message}`;
      falha('LEITURA', `${pasta}: ${motivo}`);
      return;
    }
  }
  const resultado = compararFeeds(feeds[0], feeds[1]);
  process.stdout.write(ascii(formatarRelatorio(resultado)));
  process.exitCode = resultado.total > 0 ? 1 : 0;
};

principal(process.argv.slice(2));
