/**
 * Liga o relógio de teste (D-095, D-151) à árvore: entrega "agora" pelo `NowProvider` e avisa a interface (faixa,
 * seletor) quando o relógio liga, troca ou desliga. O relógio vive só na memória (nada é gravado).
 * Cada mudança cria uma `source` nova: quem lê "agora" (`useNowTick`) renova o valor na hora, sem esperar o minuto virar.
 */
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import type { WallClock } from "@notebus/domain";
import type { TestClock } from "./clock";
import { NowProvider } from "./NowProvider";

interface TestClockValue {
  /** Instante escolhido (ms), ou `null` com o relógio desligado. */
  chosen: number | null;
  turnOn(wall: WallClock): void;
  turnOff(): void;
}

const TestClockContext = createContext<TestClockValue | null>(null);

export function TestClockProvider({ clock, children }: { clock: TestClock; children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const turnOn = useCallback(
    (wall: WallClock) => {
      clock.set(wall);
      setVersion((v) => v + 1);
    },
    [clock],
  );
  const turnOff = useCallback(() => {
    clock.turnOff();
    setVersion((v) => v + 1);
  }, [clock]);
  // `version` só serve para trocar a identidade da função.
  const source = useMemo(() => () => clock.now(), [clock, version]);
  const value = useMemo(() => ({ chosen: clock.chosen(), turnOn, turnOff }), [clock, version, turnOn, turnOff]);
  return (
    <TestClockContext.Provider value={value}>
      <NowProvider source={source}>{children}</NowProvider>
    </TestClockContext.Provider>
  );
}

export function useTestClock(): TestClockValue {
  const value = useContext(TestClockContext);
  if (!value) throw new Error("useTestClock fora do TestClockProvider");
  return value;
}
