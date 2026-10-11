import { describe, expect, it } from "vitest";
import { createMarginStepper } from "./marginStepper";
import { stepMargin } from "./settingsView";

describe("Item 1.1: Reprodução do mecanismo do defeito D1 (handler anterior)", () => {
  it("3 toques seguidos para baixo a partir de 5 com eco atrasado da 1ª gravação terminam em valor diferente de 2", async () => {
    // Modela exatamente o comportamento do handler antes do bloco 1d:
    // Estado local, gravações assíncronas com atraso e eco de useEffect([prefs.margin])
    let localMargin = 5;
    const writeDeferreds: Array<{ value: number; resolve: (ok: boolean) => void }> = [];

    const fakeSetMargin = (val: number) =>
      new Promise<boolean>((resolve) => {
        writeDeferreds.push({ value: val, resolve });
      });

    const syncEcho = (recordedVal: number) => {
      localMargin = recordedVal;
    };

    const handleStepMargin = (dir: 1 | -1) => {
      const next = stepMargin(localMargin, dir);
      if (next.value === localMargin) return;
      localMargin = next.value;
      void fakeSetMargin(next.value).then((ok) => {
        if (ok) syncEcho(next.value);
      });
    };

    // 3 toques seguidos rápidos para baixo
    handleStepMargin(-1); // localMargin = 4, gravação iniciada com 4
    handleStepMargin(-1); // localMargin = 3, gravação iniciada com 3
    handleStepMargin(-1); // localMargin = 2, gravação iniciada com 2

    expect(localMargin).toBe(2);
    expect(writeDeferreds).toHaveLength(3);

    // O eco da 1ª gravação (valor 4) chega depois do 3º toque:
    writeDeferreds[0]!.resolve(true);
    await Promise.resolve(); // aguarda a microtask da promessa

    // O eco sobrescreveu o estado local com o valor gravado pelo 1º toque (4),
    // terminando em valor diferente de 2!
    expect(localMargin).not.toBe(2);
    expect(localMargin).toBe(4);
  });
});

describe("Item 1.2: createMarginStepper", () => {
  it("10 toques para baixo a partir de 10 mostram 9, 8, … 0 na hora e gravam no máximo 2 vezes, a última com 0", async () => {
    const shownHistory: number[] = [];
    const writeCalls: Array<{ value: number; resolve: (ok: boolean) => void }> = [];

    const stepper = createMarginStepper({
      initial: 10,
      show: (val) => shownHistory.push(val),
      write: (val) =>
        new Promise<boolean>((resolve) => {
          writeCalls.push({ value: val, resolve });
        }),
    });

    // 10 toques seguidos para baixo
    for (let i = 0; i < 10; i++) {
      stepper.step(-1);
    }

    // Mostrou na hora 9, 8, 7, 6, 5, 4, 3, 2, 1, 0
    expect(shownHistory).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(stepper.shown()).toBe(0);
    expect(stepper.isBusy()).toBe(true);

    // Apenas a 1ª gravação (com 9) foi disparada até agora
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0]!.value).toBe(9);

    // Resolve a 1ª gravação
    writeCalls[0]!.resolve(true);
    await Promise.resolve();

    // Dispara a 2ª gravação, com o último alvo acumulado (0)
    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[1]!.value).toBe(0);

    // Resolve a 2ª gravação
    writeCalls[1]!.resolve(true);
    await Promise.resolve();

    expect(stepper.isBusy()).toBe(false);
    expect(stepper.shown()).toBe(0);
  });

  it("o eco de uma gravação antiga não muda o valor mostrado enquanto há toques pendentes", async () => {
    const shownHistory: number[] = [];
    const writeCalls: Array<{ value: number; resolve: (ok: boolean) => void }> = [];

    const stepper = createMarginStepper({
      initial: 5,
      show: (val) => shownHistory.push(val),
      write: (val) =>
        new Promise<boolean>((resolve) => {
          writeCalls.push({ value: val, resolve });
        }),
    });

    stepper.step(-1); // show(4), write(4) inicia
    stepper.step(-1); // show(3), pendingTarget = 3
    stepper.step(-1); // show(2), pendingTarget = 2

    expect(stepper.shown()).toBe(2);

    // Chega um eco de prefs.margin = 4 (da 1ª gravação) enquanto há toques pendentes
    stepper.sync(4);

    // O valor mostrado continua 2 e não foi sobrescrito para 4
    expect(stepper.shown()).toBe(2);
    expect(shownHistory).toEqual([4, 3, 2]);

    // Conclui as gravações
    writeCalls[0]!.resolve(true);
    await Promise.resolve();

    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[1]!.value).toBe(2);

    writeCalls[1]!.resolve(true);
    await Promise.resolve();

    expect(stepper.isBusy()).toBe(false);
    expect(stepper.shown()).toBe(2);
  });

  it("mudar de direção no meio (3 para baixo, 2 para cima) termina no valor certo", async () => {
    const writeCalls: Array<{ value: number; resolve: (ok: boolean) => void }> = [];

    const stepper = createMarginStepper({
      initial: 5,
      show: () => {},
      write: (val) =>
        new Promise<boolean>((resolve) => {
          writeCalls.push({ value: val, resolve });
        }),
    });

    // 3 para baixo a partir de 5: 4, 3, 2
    stepper.step(-1);
    stepper.step(-1);
    stepper.step(-1);
    // 2 para cima a partir de 2: 3, 4
    stepper.step(1);
    stepper.step(1);

    expect(stepper.shown()).toBe(4);

    // Resolve a primeira gravação (4)
    writeCalls[0]!.resolve(true);
    await Promise.resolve();

    // Como o último alvo (4) é igual ao que acabou de ser gravado e confirmado (4),
    // nenhuma gravação redundante é disparada
    expect(writeCalls).toHaveLength(1);
    expect(stepper.isBusy()).toBe(false);
    expect(stepper.shown()).toBe(4);
  });

  it("write devolvendo false volta ao último confirmado e descarta o alvo pendente", async () => {
    const shownHistory: number[] = [];
    const writeCalls: Array<{ value: number; resolve: (ok: boolean) => void }> = [];

    const stepper = createMarginStepper({
      initial: 5,
      show: (val) => shownHistory.push(val),
      write: (val) =>
        new Promise<boolean>((resolve) => {
          writeCalls.push({ value: val, resolve });
        }),
    });

    stepper.step(-1); // show(4)
    stepper.step(-1); // show(3)

    expect(stepper.shown()).toBe(3);

    // Gravação falha devolvendo false
    writeCalls[0]!.resolve(false);
    await Promise.resolve();

    // Reverteu ao valor confirmado inicial (5)
    expect(stepper.shown()).toBe(5);
    expect(shownHistory).toEqual([4, 3, 5]);
    expect(stepper.isBusy()).toBe(false);
  });

  it("write que lança também volta ao último confirmado e descarta o alvo pendente", async () => {
    const shownHistory: number[] = [];
    const writeCalls: Array<{ value: number; reject: (err: Error) => void }> = [];

    const stepper = createMarginStepper({
      initial: 5,
      show: (val) => shownHistory.push(val),
      write: () =>
        new Promise<boolean>((_, reject) => {
          writeCalls.push({ value: 4, reject });
        }),
    });

    stepper.step(-1); // show(4)
    stepper.step(-1); // show(3)

    expect(stepper.shown()).toBe(3);

    // Gravação lança exceção
    writeCalls[0]!.reject(new Error("rede falhou"));
    await Promise.resolve();

    // Reverteu para 5
    expect(stepper.shown()).toBe(5);
    expect(shownHistory).toEqual([4, 3, 5]);
    expect(stepper.isBusy()).toBe(false);
  });

  it("em 0 e em 10 step não grava nem chama show", () => {
    let showCalled = false;
    let writeCalled = false;

    // Em 0, step(-1) não faz nada
    const stepperMin = createMarginStepper({
      initial: 0,
      show: () => {
        showCalled = true;
      },
      write: async () => {
        writeCalled = true;
        return true;
      },
    });

    stepperMin.step(-1);
    expect(showCalled).toBe(false);
    expect(writeCalled).toBe(false);
    expect(stepperMin.shown()).toBe(0);

    // Em 10, step(1) não faz nada
    const stepperMax = createMarginStepper({
      initial: 10,
      show: () => {
        showCalled = true;
      },
      write: async () => {
        writeCalled = true;
        return true;
      },
    });

    stepperMax.step(1);
    expect(showCalled).toBe(false);
    expect(writeCalled).toBe(false);
    expect(stepperMax.shown()).toBe(10);
  });

  it("sync depois de tudo parado atualiza o valor", () => {
    let shownVal = 5;
    const stepper = createMarginStepper({
      initial: 5,
      show: (val) => {
        shownVal = val;
      },
      write: async () => true,
    });

    expect(stepper.isBusy()).toBe(false);

    stepper.sync(7);

    expect(shownVal).toBe(7);
    expect(stepper.shown()).toBe(7);
  });
});
