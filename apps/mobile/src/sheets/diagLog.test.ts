import { describe, expect, it } from "vitest";
import {
  DIAG_STRIP_EVENT_COUNT,
  type DiagEvent,
  createDiagStore,
  diagStripLines,
  formatDiagLog,
  homeLayerPointerEvents,
  pushDiagEvent,
  SELECTOR_CLOSED,
  SELECTOR_OPENED,
} from "./diagLog";

describe("diagLog", () => {
  describe("pushDiagEvent", () => {
    it("o registro nunca passa de max e o mais antigo sai primeiro", () => {
      let log: DiagEvent[] = [];
      log = pushDiagEvent(log, { at: 1000, text: "evento 1" }, 3);
      log = pushDiagEvent(log, { at: 2000, text: "evento 2" }, 3);
      log = pushDiagEvent(log, { at: 3000, text: "evento 3" }, 3);
      expect(log).toHaveLength(3);
      expect(log[0]?.text).toBe("evento 1");

      // Adiciona o quarto: o mais antigo ("evento 1") sai primeiro
      log = pushDiagEvent(log, { at: 4000, text: "evento 4" }, 3);
      expect(log).toHaveLength(3);
      expect(log.map((e) => e.text)).toEqual(["evento 2", "evento 3", "evento 4"]);
    });

    it("a lista de entrada não é alterada (imutável)", () => {
      const initial: readonly DiagEvent[] = Object.freeze([
        { at: 1000, text: "ev 1" },
      ]);
      const next = pushDiagEvent(initial, { at: 2000, text: "ev 2" }, 5);
      expect(initial).toHaveLength(1);
      expect(next).toHaveLength(2);
      expect(next).not.toBe(initial);
    });

    it("trata max <= 0 devolvendo lista vazia", () => {
      const log = pushDiagEvent([], { at: 1000, text: "ev" }, 0);
      expect(log).toEqual([]);
    });

    it("agrupa eventos iguais seguidos com ×N e horário da última; separado por outro não agrupa", () => {
      let log: DiagEvent[] = [];
      log = pushDiagEvent(log, { at: 1000, text: "frase mostrar" }, 10);
      log = pushDiagEvent(log, { at: 2000, text: "frase mostrar" }, 10);
      log = pushDiagEvent(log, { at: 3000, text: "frase mostrar" }, 10);
      expect(log).toEqual([{ at: 3000, text: "frase mostrar ×3" }]);

      log = pushDiagEvent(log, { at: 4000, text: "frase ocultar" }, 10);
      log = pushDiagEvent(log, { at: 5000, text: "frase mostrar" }, 10);
      expect(log).toEqual([
        { at: 3000, text: "frase mostrar ×3" },
        { at: 4000, text: "frase ocultar" },
        { at: 5000, text: "frase mostrar" },
      ]);
    });
  });

  describe("formatDiagLog", () => {
    it("formata uma linha por evento com segundos desde now fixo", () => {
      const events: DiagEvent[] = [
        { at: 7000, text: "seletor aberto" },
        { at: 9000, text: "fechar stop#1" },
      ];
      // now fixo em 10_000 ms (10s)
      const lines = formatDiagLog(events, 10_000);
      expect(lines).toEqual([
        "há 3 s: seletor aberto",
        "há 1 s: fechar stop#1",
      ]);
    });

    it("não produz segundos negativos se now for anterior ao evento", () => {
      const events: DiagEvent[] = [{ at: 12000, text: "futuro" }];
      const lines = formatDiagLog(events, 10_000);
      expect(lines).toEqual(["há 0 s: futuro"]);
    });
  });

  describe("homeLayerPointerEvents", () => {
    it("homeLayerPointerEvents(0) é box-none", () => {
      expect(homeLayerPointerEvents(0)).toBe("box-none");
    });

    it("homeLayerPointerEvents(1) é none", () => {
      expect(homeLayerPointerEvents(1)).toBe("none");
    });

    it("homeLayerPointerEvents(2) é none", () => {
      expect(homeLayerPointerEvents(2)).toBe("none");
    });
  });

  describe("createDiagStore", () => {
    it("grava e respeita max", () => {
      const store = createDiagStore(3);
      store.record("ev 1", 1000);
      store.record("ev 2", 2000);
      store.record("ev 3", 3000);
      store.record("ev 4", 4000);
      const snap = store.getSnapshot();
      expect(snap.events).toHaveLength(3);
      expect(snap.events.map((e) => e.text)).toEqual(["ev 2", "ev 3", "ev 4"]);
    });

    it("picker muda com as duas constantes e só com elas", () => {
      const store = createDiagStore(5);
      expect(store.getSnapshot().picker).toBe("fechado");
      store.record("outro evento", 1000);
      expect(store.getSnapshot().picker).toBe("fechado");
      store.record(SELECTOR_OPENED, 2000);
      expect(store.getSnapshot().picker).toBe("aberto");
      store.record("mais um", 3000);
      expect(store.getSnapshot().picker).toBe("aberto");
      store.record(SELECTOR_CLOSED, 4000);
      expect(store.getSnapshot().picker).toBe("fechado");
    });

    it("subscribe é chamado a cada record e não é chamado depois de cancelar", () => {
      const store = createDiagStore(5);
      let calls = 0;
      const unsubscribe = store.subscribe(() => {
        calls++;
      });
      store.record("ev 1", 1000);
      store.record("ev 2", 2000);
      expect(calls).toBe(2);
      unsubscribe();
      store.record("ev 3", 3000);
      expect(calls).toBe(2);
    });

    it("getSnapshot() devolve a mesma referência sem record e outra depois", () => {
      const store = createDiagStore(5);
      const snap1 = store.getSnapshot();
      const snap2 = store.getSnapshot();
      expect(snap1).toBe(snap2);
      store.record("ev", 1000);
      const snap3 = store.getSnapshot();
      expect(snap3).not.toBe(snap1);
      const snap4 = store.getSnapshot();
      expect(snap3).toBe(snap4);
    });

    it("cancelar dentro da notificação não pula ouvinte", () => {
      const store = createDiagStore(5);
      const log: string[] = [];
      let unsub1: (() => void) | undefined;
      unsub1 = store.subscribe(() => {
        log.push("l1");
        unsub1?.();
      });
      store.subscribe(() => {
        log.push("l2");
      });
      store.record("primeiro", 1000);
      expect(log).toEqual(["l1", "l2"]);
      log.length = 0;
      store.record("segundo", 2000);
      expect(log).toEqual(["l2"]);
    });
  });

  describe("diagStripLines", () => {
    it("constante da faixa fixa 12 eventos", () => {
      expect(DIAG_STRIP_EVENT_COUNT).toBe(12);
    });

    it("pushDiagEvent com max 60 guarda os 60 últimos", () => {
      let log: DiagEvent[] = [];
      for (let i = 0; i < 70; i++) {
        log = pushDiagEvent(log, { at: i * 1000, text: `ev ${i}` }, 60);
      }
      expect(log.length).toBe(60);
      expect(log[0]!.text).toBe("ev 10");
      expect(log[59]!.text).toBe("ev 69");
    });

    it("com 0, 1, 2 e 10 eventos e pilha com 0 e 8 entradas, length <= 8 sempre", () => {
      const stack8 = Array.from({ length: 8 }, (_, i) => ({ kind: "stop", id: i + 1 }));
      const events10: DiagEvent[] = Array.from({ length: 10 }, (_, i) => ({ at: i * 1000, text: `ev ${i}` }));

      const l0_0 = diagStripLines({ sha: "abc", homePointer: "box-none", picker: "fechado", stack: [], events: [], now: 10000 });
      expect(l0_0.length).toBeLessThanOrEqual(8);
      expect(l0_0.length).toBe(2);

      const l1_0 = diagStripLines({ sha: "abc", homePointer: "box-none", picker: "fechado", stack: [], events: events10.slice(0, 1), now: 10000 });
      expect(l1_0.length).toBeLessThanOrEqual(8);
      expect(l1_0.length).toBe(3);

      const l2_8 = diagStripLines({ sha: "abc", homePointer: "none", picker: "aberto", stack: stack8, events: events10.slice(0, 2), now: 10000 });
      expect(l2_8.length).toBeLessThanOrEqual(8);
      expect(l2_8.length).toBe(4);

      const l10_8 = diagStripLines({ sha: "abc", homePointer: "none", picker: "aberto", stack: stack8, events: events10, now: 10000 });
      expect(l10_8.length).toBeLessThanOrEqual(14);
      expect(l10_8.length).toBe(12);
    });

    it("linha 1 traz sha, home e seletor", () => {
      const lines = diagStripLines({ sha: "9f8a12c", homePointer: "none", picker: "aberto", stack: [], events: [], now: 1000 });
      expect(lines[0]).toBe("[DIAG] 9f8a12c · home=none · seletor=aberto");
    });

    it("linha 2 traz o topo certo e topo=nenhum com pilha vazia", () => {
      const empty = diagStripLines({ sha: "abc", homePointer: "box-none", picker: "fechado", stack: [], events: [], now: 1000 });
      expect(empty[1]).toBe("topo=nenhum · pilha=[]");

      const populated = diagStripLines({
        sha: "abc",
        homePointer: "none",
        picker: "fechado",
        stack: [{ kind: "place", id: 1 }, { kind: "stop", id: 42 }],
        events: [],
        now: 1000,
      });
      expect(populated[1]).toBe("topo=stop#42 · pilha=[place#1 > stop#42]");
    });

    it("linhas 3 a 8 são os 6 últimos eventos, na ordem", () => {
      const events: DiagEvent[] = Array.from({ length: 8 }, (_, i) => ({
        at: (i + 1) * 1000,
        text: `ev ${i + 1}`,
      }));
      const lines = diagStripLines({
        sha: "abc",
        homePointer: "none",
        picker: "fechado",
        stack: [],
        events,
        now: 10_000,
      });
      expect(lines.length).toBe(10);
      expect(lines[2]).toBe("há 9 s: ev 1");
      expect(lines[9]).toBe("há 2 s: ev 8");
    });

    it("com 15 eventos mostra os 12 últimos (linhas 3 a 14)", () => {
      const events: DiagEvent[] = Array.from({ length: 15 }, (_, i) => ({
        at: (i + 1) * 1000,
        text: `ev ${i + 1}`,
      }));
      const lines = diagStripLines({
        sha: "abc",
        homePointer: "none",
        picker: "fechado",
        stack: [],
        events,
        now: 20_000,
      });
      expect(lines.length).toBe(14);
      expect(lines[2]).toBe("há 16 s: ev 4");
      expect(lines[13]).toBe("há 5 s: ev 15");
    });

    it("corta os eventos mais antigos quando a altura da tela não comporta os 12 em 45%", () => {
      const events: DiagEvent[] = Array.from({ length: 12 }, (_, i) => ({
        at: (i + 1) * 1000,
        text: `ev ${i + 1}`,
      }));
      // windowHeight = 200 -> 45% = 90 px -> (90 - 6) / 12 = 7 linhas no total (2 fixas + 5 eventos)
      const lines = diagStripLines({
        sha: "abc",
        homePointer: "none",
        picker: "fechado",
        stack: [],
        events,
        now: 20_000,
        windowHeight: 200,
      });
      expect(lines.length).toBe(7);
      expect(lines[2]).toBe("há 12 s: ev 8");
      expect(lines[6]).toBe("há 8 s: ev 12");
    });
  });
});
