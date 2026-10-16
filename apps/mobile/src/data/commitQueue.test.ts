/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCommitQueue } from "./commitQueue";
import { optimisticIdle, requestValue, settle, shownValue } from "./switchOptimistic";

function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("commitQueue (FN-23)", () => {
  it("reprodução sem fila: duas chamadas fora de ordem terminam com true gravado em vez de false", async () => {
    let saved = false;
    let state = optimisticIdle;
    const first = deferred();
    const second = deferred();
    let call = 0;

    const rawCommit = async (value: boolean) => {
      call += 1;
      if (call === 1) {
        await first.promise;
      } else {
        await second.promise;
      }
      saved = value;
    };

    const triggerWithoutQueue = (value: boolean) => {
      const next = requestValue(state, value);
      state = next;
      return (async () => {
        try {
          await rawCommit(value);
        } finally {
          state = settle(state, next.seq);
        }
      })();
    };

    // Dois toques rápidos: true (demora mais), depois false (termina antes)
    const p1 = triggerWithoutQueue(true);
    const p2 = triggerWithoutQueue(false);

    second.resolve();
    await p2;
    first.resolve();
    await p1;

    // Sem fila, a primeira termina por último e vence (saved === true, o defeito FN-23)
    expect(saved).toBe(true);
    expect(shownValue(saved, state)).toBe(true);
  });

  it("ordem fora de ordem termina no último pedido: segunda só começa depois que a primeira terminou", async () => {
    let saved = false;
    let state = optimisticIdle;
    const first = deferred();
    const second = deferred();
    const started: boolean[] = [];

    const queue = createCommitQueue(async (value: boolean) => {
      started.push(value);
      if (value) {
        await first.promise;
      } else {
        await second.promise;
      }
      saved = value;
    });

    const trigger = (value: boolean) => {
      const next = requestValue(state, value);
      state = next;
      return (async () => {
        try {
          await queue.enqueue(value);
        } finally {
          state = settle(state, next.seq);
        }
      })();
    };

    const p1 = trigger(true);
    const p2 = trigger(false);
    await Promise.resolve();

    // Enquanto a primeira está rodando, a segunda ainda não começou e o valor otimista já mostra false
    expect(started).toEqual([true]);
    expect(shownValue(saved, state)).toBe(false);

    // Mesmo se a condição da segunda já estiver pronta antes, ela espera a primeira terminar
    second.resolve();
    await Promise.resolve();
    expect(started).toEqual([true]);

    first.resolve();
    await p1;
    await p2;

    expect(started).toEqual([true, false]);
    expect(saved).toBe(false);
    expect(shownValue(saved, state)).toBe(false);
  });

  it("erro na primeira não trava a segunda", async () => {
    let saved = false;
    const executed: boolean[] = [];

    const queue = createCommitQueue(async (value: boolean) => {
      executed.push(value);
      if (value) {
        throw new Error("falha no banco");
      }
      saved = value;
    });

    const p1 = queue.enqueue(true).catch(() => "ignorado");
    const p2 = queue.enqueue(false);

    await p1;
    await p2;

    expect(executed).toEqual([true, false]);
    expect(saved).toBe(false);
  });

  it("duas chamadas sem atraso rodam em sequência e terminam no último valor", async () => {
    const log: boolean[] = [];
    let saved = false;

    const queue = createCommitQueue(async (value: boolean) => {
      log.push(value);
      saved = value;
    });

    await Promise.all([queue.enqueue(true), queue.enqueue(false)]);
    expect(log).toEqual([true, false]);
    expect(saved).toBe(false);
  });

  it("guarda estático: useOptimisticSwitch cria a fila com createCommitQueue e chama queue.enqueue(value) dentro do fluxo", () => {
    const hookPath = join(__dirname, "../ui/useOptimisticSwitch.ts");
    const raw = readFileSync(hookPath, "utf8");
    const norm = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").replace(/\s+/g, " ");

    // Usa createCommitQueue ligado ao commit atual via ref
    expect(
      /const\s+commitRef\s*=\s*useRef\(commit\);\s*commitRef\.current\s*=\s*commit;\s*const\s+queue\s*=\s*useRef\(\s*createCommitQueue\(/.test(
        norm,
      ),
    ).toBe(true);
    expect(norm).toContain("commitRef.current(value)");

    // Dentro de onValueChange, aguarda queue.enqueue(nextValue) e não commit(value) direto
    expect(
      /const\s+nextValue\s*=\s*nextSwitchValue\(saved,\s*ref\.current\);\s*const\s+next\s*=\s*requestValue\(ref\.current,\s*nextValue\);\s*apply\(next\);\s*void\s*\(async\s*\(\)\s*=>\s*\{\s*try\s*\{\s*await\s+queue\.enqueue\(nextValue\);/.test(
        norm,
      ),
    ).toBe(true);

    expect(/\bawait\s+commit\s*\(/.test(norm)).toBe(false);
  });

  it("guarda estático (FN-23): onValueChange não usa o argumento recebido e usa nextSwitchValue", () => {
    const hookPath = join(__dirname, "../ui/useOptimisticSwitch.ts");
    const raw = readFileSync(hookPath, "utf8");
    const norm = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").replace(/\s+/g, " ");

    // Usa nextSwitchValue(saved, ref.current) para calcular o próximo valor e ignora o argumento do evento
    expect(norm).toContain("nextSwitchValue(");
    expect(
      /const\s+nextVal(ue)?\s*=\s*nextSwitchValue\(saved,\s*ref\.current\);/.test(norm) ||
      /requestValue\(ref\.current,\s*nextSwitchValue\(saved,\s*ref\.current\)\)/.test(norm),
    ).toBe(true);
    // onValueChange não passa o argumento de entrada (event value) para requestValue
    expect(norm).not.toMatch(/requestValue\(ref\.current,\s*value\)/);

    // Registra sw <label> toque ... dentro de if (DIAG_SCROLL)
    expect(norm).toMatch(/recordDiagEvent\(`sw \$\{label\} toque/);
  });
});
