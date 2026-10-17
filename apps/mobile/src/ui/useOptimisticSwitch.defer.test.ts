/** E-09 bloco 29, item 1b: `deferCommitMs` adia só a entrada na fila de gravação; o valor mostrado muda na hora. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rt = vi.hoisted(() => {
  const state = { slots: [] as { v: unknown }[], idx: 0, memo: [] as { deps: readonly unknown[]; value: unknown }[], effects: [] as { deps?: readonly unknown[]; cleanup?: () => void }[], pending: [] as (() => void)[] };
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    useState<T>(init: T): [T, (v: T) => void] {
      const i = state.idx++;
      if (!state.slots[i]) state.slots[i] = { v: init };
      const slot = state.slots[i]!;
      return [slot.v as T, (v) => { slot.v = v; }];
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
      state.pending.push(() => {
        e?.cleanup?.();
        const cleanup = fn();
        state.effects[i] = { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
      });
      state.effects[i] = { deps, cleanup: e?.cleanup };
    },
  };
  return { state, react };
});

vi.mock("react", () => ({ ...rt.react, default: rt.react }));
vi.mock("../sheets/diagScroll", () => ({ DIAG_SCROLL: false, recordDiagEvent: vi.fn() }));

import { useOptimisticSwitch } from "./useOptimisticSwitch";

function setup(options?: { deferCommitMs?: number }) {
  rt.state.slots = []; rt.state.idx = 0; rt.state.memo = []; rt.state.effects = []; rt.state.pending = [];
  const commit = vi.fn(async (_value: boolean) => {});
  let latest!: ReturnType<typeof useOptimisticSwitch>;
  const render = () => {
    rt.state.idx = 0;
    latest = useOptimisticSwitch(false, commit, "x", options);
    rt.state.pending.splice(0).forEach((e) => e());
  };
  render();
  return { commit, render, get: () => latest };
}

describe("useOptimisticSwitch com deferCommitMs", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("(a) mostra na hora e só grava depois de 210 ms, uma vez", async () => {
    const s = setup({ deferCommitMs: 210 });
    s.get().onValueChange(true);
    s.render();
    expect(s.get().value).toBe(true);
    await vi.advanceTimersByTimeAsync(209);
    expect(s.commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.commit).toHaveBeenCalledTimes(1);
    expect(s.commit).toHaveBeenCalledWith(true);
  });

  it("(b) três toques rápidos gravam na ordem dos toques", async () => {
    const s = setup({ deferCommitMs: 210 });
    for (let i = 0; i < 3; i++) {
      s.get().onValueChange(true);
      s.render();
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(s.get().value).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.commit.mock.calls.map((c) => c[0])).toEqual([true, false, true]);
  });

  it("(c) desmontar antes do prazo não perde a gravação", async () => {
    const s = setup({ deferCommitMs: 210 });
    s.get().onValueChange(true);
    s.render();
    rt.state.effects.forEach((e) => e?.cleanup?.()); // desmonta
    await vi.advanceTimersByTimeAsync(210);
    expect(s.commit).toHaveBeenCalledWith(true);
  });

  it("(d) sem a opção, grava sem espera", async () => {
    const s = setup();
    s.get().onValueChange(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.commit).toHaveBeenCalledTimes(1);
  });
});
