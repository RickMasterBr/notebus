/** "Agora" para as telas que mostram horário: o instante do `NowProvider`, renovado quando o minuto muda. */
import { useEffect, useState } from "react";
import { useNow } from "./NowProvider";

const CHECK_EVERY_MS = 15_000;

export function useNowTick(): number {
  const source = useNow();
  const [instant, setInstant] = useState(() => source());
  // Relógio de teste ligado, trocado ou desligado (a `source` mudou): vale o novo valor já, sem esperar o minuto virar.
  useEffect(() => {
    setInstant(source());
  }, [source]);
  useEffect(() => {
    const id = setInterval(() => {
      const next = source();
      // Só re-renderiza quando o minuto virou: a tela mostra horas e minutos, não segundos.
      setInstant((cur) => (Math.floor(next / 60_000) === Math.floor(cur / 60_000) ? cur : next));
    }, CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [source]);
  return instant;
}
