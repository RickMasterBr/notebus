/// <reference types="node" />
/**
 * E-09 bloco 20a, item 1: simulador do interruptor "Incluir feriados municipais" (FN-23).
 * Roda o hook REAL (`useOptimisticSwitch`) sobre um mini-React (useState/useRef/useCallback/useEffect) com renderização
 * em lote e relógio falso, mais um `Switch` nativo falso que vira sozinho ao toque e só volta ao valor da prop num
 * render novo (regra do `Switch` do React Native). O simulador é MODELO: não prova nada sobre o iPhone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rt = vi.hoisted(() => {
  type Slot = { v: unknown };
  const state = {
    slots: [] as Slot[],
    idx: 0,
    dirty: false,
    memo: [] as { deps: readonly unknown[]; value: unknown }[],
    effects: [] as { deps: readonly unknown[] | undefined; cleanup?: () => void }[],
    pendingEffects: [] as (() => void)[],
    onDirty: () => {},
  };
  const same = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined) =>
    !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    useState<T>(init: T): [T, (v: T | ((p: T) => T)) => void] {
      const i = state.idx++;
      if (!state.slots[i]) state.slots[i] = { v: init };
      const slot = state.slots[i]!;
      return [
        slot.v as T,
        (v) => {
          const next = typeof v === "function" ? (v as (p: T) => T)(slot.v as T) : v;
          if (Object.is(next, slot.v)) return;
          slot.v = next;
          state.dirty = true;
          state.onDirty();
        },
      ];
    },
    useRef<T>(init: T): { current: T } {
      const i = state.idx++;
      if (!state.slots[i]) state.slots[i] = { v: { current: init } };
      return state.slots[i]!.v as { current: T };
    },
    useCallback<T>(fn: T, deps: readonly unknown[]): T {
      const i = state.idx++;
      const m = state.memo[i];
      if (m && same(m.deps, deps)) return m.value as T;
      state.memo[i] = { deps, value: fn };
      return fn;
    },
    useEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
      const i = state.idx++;
      const e = state.effects[i];
      if (e && deps && same(e.deps, deps)) return;
      state.pendingEffects.push(() => {
        e?.cleanup?.();
        const cleanup = fn();
        state.effects[i] = { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
      });
      state.effects[i] = { deps, cleanup: e?.cleanup };
    },
  };
  return { state, react, diagSpy: vi.fn() };
});

vi.mock("react", () => ({ ...rt.react, default: rt.react }));
vi.mock("../sheets/diagScroll", () => ({ DIAG_SCROLL: false, recordDiagEvent: rt.diagSpy }));

import { useOptimisticSwitch } from "./useOptimisticSwitch";

type Variant = {
  /** Atraso da gravação no banco (ms). */
  writeMs: number | number[];
  /** Tempo que a recarga dos horários bloqueia o JS (ms); 0 = sem recarga. */
  reloadMs: number;
  /** Atraso da releitura que atualiza `saved` (ms). */
  readMs: number;
  /** Atraso do React para renderizar depois de um setState / evento (ms). */
  renderLag: number;
};
/** Avisos: gravação rápida, sem recarga (a decisão de permissão custa pouco). */
const FAST: Variant = { writeMs: 5, reloadMs: 0, readMs: 3, renderLag: 4 };
/** Feriados: a recarga do `ScheduleProvider` recalcula tudo e ocupa o JS. */
const SLOW_RELOAD: Variant = { writeMs: 5, reloadMs: 600, readMs: 3, renderLag: 4 };

function simulate(
  initial: boolean,
  tapTimes: number[],
  v: Variant,
  runUntil = 5000,
  extra: { externalSaved?: { at: number; value: boolean }; failFirst?: boolean } = {},
) {
  rt.state.slots = [];
  rt.state.idx = 0;
  rt.state.dirty = false;
  rt.state.memo = [];
  rt.state.effects = [];
  rt.state.pendingEffects = [];

  let db = initial;
  let jsFreeAt = 0;
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  let native = initial;
  let nativeTouched = false;
  const trace: { t: number; native: boolean }[] = [{ t: 0, native }];
  let latest!: { value: boolean; onValueChange: (e: boolean) => void };
  let setSaved!: (v: boolean) => void;
  let savedNow = initial;
  const writes: boolean[] = [];

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const nowMs = () => Date.now();
  /** Executa quando o JS estiver livre (evento e render esperam a recarga bloqueante). */
  const runWhenFree = (fn: () => void, delay = 0) => setTimeout(fn, Math.max(delay, jsFreeAt - nowMs()));
  const setNative = (value: boolean) => {
    if (native !== value) {
      native = value;
      trace.push({ t: nowMs(), native });
    }
  };

  const commit = async (value: boolean) => {
    const call = writes.length;
    writes.push(value);
    await sleep(typeof v.writeMs === "number" ? v.writeMs : (v.writeMs[call] ?? 5));
    if (extra.failFirst && call === 0) throw new Error("falha simulada");
    db = value;
    if (v.reloadMs > 0) {
      jsFreeAt = nowMs() + v.reloadMs;
      await sleep(v.reloadMs);
    }
    const read = db;
    await sleep(v.readMs);
    savedNow = read;
    setSaved(read);
  };

  const component = () => {
    const [saved, set] = rt.react.useState(initial);
    setSaved = set;
    latest = useOptimisticSwitch(saved, commit, "x");
  };
  const render = () => {
    rt.state.dirty = false;
    rt.state.idx = 0;
    component();
    const effects = rt.state.pendingEffects.splice(0);
    effects.forEach((e) => e());
    // regra do Switch do RN: depois de um evento, o nativo é forçado ao valor da prop em todo render
    if (nativeTouched) setNative(latest.value);
  };
  const scheduleRender = () => {
    if (renderTimer) return;
    renderTimer = runWhenFree(() => {
      renderTimer = null;
      render();
    }, v.renderLag);
  };
  rt.state.onDirty = scheduleRender;

  render();
  const tap = () => {
    nativeTouched = true;
    setNative(!native); // o UISwitch vira na hora (thread de UI)
    const eventValue = native;
    const handler = latest.onValueChange; // o handler do ÚLTIMO render (closure velha, se não renderizou)
    runWhenFree(() => handler(eventValue));
    scheduleRender();
  };

  return {
    run: async () => {
      let elapsed = 0;
      const sorted = [...tapTimes].sort((a, b) => a - b);
      const ext = extra.externalSaved;
      if (ext) {
        setTimeout(() => {
          savedNow = ext.value;
          setSaved(ext.value);
        }, ext.at);
      }
      for (const t of sorted) {
        await vi.advanceTimersByTimeAsync(t - elapsed);
        elapsed = t;
        tap();
      }
      await vi.advanceTimersByTimeAsync(runUntil - elapsed);
      return { trace, native, db, saved: savedNow, shown: latest.value, writes };
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  rt.diagSpy.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("simulador do interruptor (E-09 bloco 20a, item 1)", () => {
  it("um toque grava o valor invertido e termina nele (avisos e feriados)", async () => {
    for (const v of [FAST, SLOW_RELOAD]) {
      const r = await simulate(true, [0], v).run();
      expect(r.writes).toEqual([false]);
      expect(r.db).toBe(false);
      expect(r.native).toBe(false);
      expect(r.shown).toBe(false);
    }
  });

  it("sequência do Rick: ligado, dois toques rápidos terminam ligados, com os dois atrasos", async () => {
    for (const v of [FAST, SLOW_RELOAD]) {
      const r = await simulate(true, [0, 120], v).run();
      expect(r.writes).toEqual([false, true]);
      expect({ native: r.native, shown: r.shown, db: r.db, saved: r.saved }).toEqual({
        native: true,
        shown: true,
        db: true,
        saved: true,
      });
    }
  });

  it("espelho: desligado, dois toques terminam desligados", async () => {
    for (const v of [FAST, SLOW_RELOAD]) {
      const r = await simulate(false, [0, 120], v).run();
      expect({ native: r.native, shown: r.shown, db: r.db, saved: r.saved }).toEqual({
        native: false,
        shown: false,
        db: false,
        saved: false,
      });
    }
  });

  it("varredura: nenhum intervalo entre toques (0 a 1500 ms) faz o simulador terminar errado, nem passar por 3 trocas", async () => {
    const gaps = [0, 1, 2, 3, 4, 5, 8, 10, 16, 30, 50, 100, 200, 400, 590, 600, 605, 610, 700, 1000, 1500];
    const bad: string[] = [];
    for (const v of [FAST, SLOW_RELOAD]) {
      for (const initial of [true, false]) {
        for (const gap of gaps) {
          const r = await simulate(initial, [0, gap], v).run();
          const finalOk = r.native === initial && r.db === initial && r.saved === initial && r.shown === initial;
          // trocas visíveis legítimas: desliga, liga (2). Mais que isso é a "terceira troca" do relato.
          const flips = r.trace.length - 1;
          if (!finalOk || flips > 2) bad.push(`${JSON.stringify(v)} initial=${initial} gap=${gap} flips=${flips} final=${r.native}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("três toques e toques em rajada também terminam no valor do último toque", async () => {
    for (const v of [FAST, SLOW_RELOAD]) {
      for (const taps of [[0, 1, 2], [0, 50, 100], [0, 300, 650], [0, 10, 20, 30]]) {
        const r = await simulate(true, taps, v).run();
        const expected = taps.length % 2 === 0;
        expect({ taps, v, n: r.native, db: r.db, s: r.saved }).toEqual({ taps, v, n: expected, db: expected, s: expected });
      }
    }
  });

  it("toque na janela entre a gravação terminar e o render com o valor novo: o segundo toque liga de volta (desliga, liga)", async () => {
    // tap1 em 0 (grava false; `saved` atualiza em 8 ms); tap2 em 8 ms, antes do render de 12 ms: o handler ainda tem `saved=true` velho.
    const r = await simulate(true, [0, 8], FAST).run();
    expect(r.writes).toEqual([false, true]);
    expect(r.trace.length - 1).toBe(2);
    expect(r.native).toBe(true);
  });
  it("gravações com atrasos fora de ordem (a primeira lenta) ainda terminam no valor do último toque: a fila serializa", async () => {
    const r = await simulate(true, [0, 10], { writeMs: [100, 5], reloadMs: 0, readMs: 3, renderLag: 4 }).run();
    expect(r.writes).toEqual([false, true]);
    expect({ native: r.native, db: r.db, saved: r.saved }).toEqual({ native: true, db: true, saved: true });
  });
  it("`saved` muda por fora depois de assentar: o toque seguinte parte do valor novo, não de um pedido antigo (lacuna a: intentRef zerado no render)", async () => {
    const r = await simulate(true, [0, 1500], FAST, 5000, { externalSaved: { at: 1000, value: true } }).run();
    expect(r.writes).toEqual([false, false]);
  });
  it("gravação falha e toque antes do render seguinte: parte do valor gravado, não do pedido que falhou (lacuna b: catch zera intentRef)", async () => {
    const bad: number[] = [];
    for (const gap of [5, 6, 7, 8]) {
      const r = await simulate(true, [0, gap], FAST, 5000, { failFirst: true }).run();
      if (r.writes[1] !== false) bad.push(gap);
    }
    expect(bad).toEqual([]);
  });
  it("nada de diag roda sem DIAG_SCROLL", async () => {
    await simulate(true, [0, 100], SLOW_RELOAD).run();
    expect(rt.diagSpy).not.toHaveBeenCalled();
  });
});
