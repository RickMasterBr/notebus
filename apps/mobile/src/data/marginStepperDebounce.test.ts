/// <reference types="node" />
// Margem: gravar só no fim da rajada de toques (E-08 boost da margem, item 3b). Agendador manual: nada de tempo real.
import { describe, expect, it } from "vitest";
import { createMarginStepper } from "./marginStepper";

function setup(initial = 10, ok = true) {
  const shown: number[] = [];
  const writes: number[] = [];
  let next = 0;
  const timers = new Map<number, () => void>();
  const delays: number[] = [];
  const stepper = createMarginStepper({
    initial,
    show: (v) => shown.push(v),
    write: async (v) => {
      writes.push(v);
      return ok;
    },
    debounce: {
      ms: 500,
      setTimer: (fn, ms) => {
        delays.push(ms);
        timers.set(++next, fn);
        return next;
      },
      clearTimer: (h) => void timers.delete(h as number),
    },
  });
  const fireTimers = async () => {
    const fns = [...timers.values()];
    timers.clear();
    fns.forEach((f) => f());
    await new Promise((r) => setTimeout(r, 0));
  };
  return { stepper, shown, writes, timers, delays, fireTimers };
}

describe("createMarginStepper com debounce", () => {
  it("10 toques seguidos geram uma gravação, com o valor final, e cada toque mostra na hora", async () => {
    const s = setup(10);
    for (let i = 0; i < 10; i++) s.stepper.step(-1);
    expect(s.shown).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(s.writes).toEqual([]);
    expect(s.timers.size).toBe(1);
    await s.fireTimers();
    expect(s.writes).toEqual([0]);
  });

  it("um toque isolado gera uma gravação, só depois dos 500 ms", async () => {
    const s = setup(5);
    s.stepper.step(1);
    expect(s.writes).toEqual([]);
    expect(s.delays).toEqual([500]);
    await s.fireTimers();
    expect(s.writes).toEqual([6]);
  });

  it("gravação recusada reverte o valor mostrado para o confirmado", async () => {
    const s = setup(5, false);
    s.stepper.step(1);
    s.stepper.step(1);
    await s.fireTimers();
    expect(s.writes).toEqual([7]);
    expect(s.shown.at(-1)).toBe(5);
    expect(s.stepper.shown()).toBe(5);
  });

  it("flush grava na hora o que espera (folha fechada antes dos 500 ms) e não grava de novo depois", async () => {
    const s = setup(5);
    s.stepper.step(-1);
    s.stepper.flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.writes).toEqual([4]);
    expect(s.timers.size).toBe(0);
    s.stepper.flush();
    await s.fireTimers();
    expect(s.writes).toEqual([4]);
  });

  it("voltar ao valor confirmado dentro da rajada não grava", async () => {
    const s = setup(5);
    s.stepper.step(1);
    s.stepper.step(-1);
    await s.fireTimers();
    expect(s.writes).toEqual([]);
  });

  it("enquanto o prazo corre, sync do eco não sobrescreve o valor mostrado e isBusy é verdadeiro", () => {
    const s = setup(5);
    s.stepper.step(1);
    expect(s.stepper.isBusy()).toBe(true);
    s.stepper.sync(5);
    expect(s.stepper.shown()).toBe(6);
  });

  it("sem a opção debounce o comportamento do bloco 1d continua: grava na hora", async () => {
    const writes: number[] = [];
    const stepper = createMarginStepper({ initial: 5, show: () => {}, write: async (v) => (writes.push(v), true) });
    stepper.step(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(writes).toEqual([6]);
    stepper.flush();
  });
});
