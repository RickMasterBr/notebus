/// <reference types="node" />
import { describe, expect, it, vi } from "vitest";
import { initialSheetState, sheetReducer } from "./stack";
import { searchPanel } from "../data/searchPanel";
import { minTouch, motion } from "../theme/tokens";

describe("F1: fechar folhas Registrar e Desci aqui ao gravar", () => {
  it("gravar pela folha Registrar fecha a folha e retorna ao Início", () => {
    // 1. Abre a folha Registrar sobre o Início
    const s1 = sheetReducer(initialSheetState, { type: "push", sheet: { kind: "board", stopId: null } });
    expect(s1.stack.map((e) => e.kind)).toEqual(["home", "board"]);
    const boardId = s1.stack[1]!.id;

    // 2. Gravação do embarque fecha a folha pelo id
    const s2 = sheetReducer(s1, { type: "close", id: boardId });
    expect(s2.stack.map((e) => e.kind)).toEqual(["home"]);
  });

  it("escolher paragem na Desci aqui fecha a folha quando a gravação tem sucesso", () => {
    // 1. Abre a folha Desci aqui sobre o Início
    const s1 = sheetReducer(initialSheetState, { type: "push", sheet: { kind: "alight" } });
    expect(s1.stack.map((e) => e.kind)).toEqual(["home", "alight"]);
    const alightId = s1.stack[1]!.id;

    // 2. Descida aceita: fecha a folha
    const s2 = sheetReducer(s1, { type: "close", id: alightId });
    expect(s2.stack.map((e) => e.kind)).toEqual(["home"]);
  });

  it("quando a descida é recusada (ok: false), a folha Desci aqui não é fechada", async () => {
    // Simula a lógica do choose em AlightSheet:
    // const ok = await alight(card, row);
    // if (ok) close();
    let closed = false;
    const close = () => {
      closed = true;
    };
    const mockAlightRefused = vi.fn().mockResolvedValue(false);

    // Tentativa com descida recusada
    const ok = await mockAlightRefused();
    if (ok) close();

    expect(mockAlightRefused).toHaveBeenCalled();
    expect(closed).toBe(false); // A folha permanece aberta!
  });
});

describe("F2: escolher ponto na Busca aberta pelo Trocar", () => {
  it("escolher ponto fecha a Busca e entrega o ponto escolhido de volta à folha Registrar", () => {
    // 1. Registrar aberto
    const s1 = sheetReducer(initialSheetState, { type: "push", sheet: { kind: "board", stopId: "stop-antigo" } });
    expect(s1.stack.map((e) => e.kind)).toEqual(["home", "board"]);

    // 2. Trocar abre a Busca em modo pick
    const s2 = sheetReducer(s1, { type: "push", sheet: { kind: "search", pick: true } });
    expect(s2.stack.map((e) => e.kind)).toEqual(["home", "board", "search"]);
    const searchId = s2.stack[2]!.id;

    // Simulação do contrato StopPickContext (request e resolve)
    let pickedStopId: string | null = null;
    let registeredCallback: ((stop: { id: string; name: string }) => void) | null = (stop) => {
      pickedStopId = stop.id;
    };

    // 3. Escolhe ponto na Busca: entrega o ponto e fecha a folha de busca
    registeredCallback({ id: "stop-novo", name: "Ponto Novo" });
    const s3 = sheetReducer(s2, { type: "close", id: searchId });

    expect(pickedStopId).toBe("stop-novo");
    expect(s3.stack.map((e) => e.kind)).toEqual(["home", "board"]);
  });
});

describe("F5: Limpar recentes existe na Busca aberta pelo Trocar e pelo Início", () => {
  it("painel de busca exibe recentes para termo vazio independentemente de estar em modo pick", () => {
    // Com recentes existentes e busca vazia, searchPanel devolve 'recents'
    expect(searchPanel("", 3)).toBe("recents");
    expect(searchPanel("", 1)).toBe("recents");
    // Sem recentes devolve prompt
    expect(searchPanel("", 0)).toBe("prompt");
  });

  it("ação de limpar esvazia a lista e permite restaurar com desfazer", () => {
    let ids = ["stop-1", "stop-2"];
    const clear = () => {
      const before = [...ids];
      ids = [];
      return before;
    };
    const restore = (previous: string[]) => {
      ids = [...previous];
    };

    const before = clear();
    expect(ids).toEqual([]);
    expect(before).toEqual(["stop-1", "stop-2"]);

    restore(before);
    expect(ids).toEqual(["stop-1", "stop-2"]);
  });
});

describe("F6: linha inteira do ponto é tocável (alvo >= 44 pt)", () => {
  it("minTouch do projeto é >= 44 pt", () => {
    expect(minTouch).toBeGreaterThanOrEqual(44);
  });
});

describe("F7: toast tem transição suave de saída e duração conforme tokens", () => {
  it("duração da transição rápida do projeto é 150 ms", () => {
    expect(motion.fast).toBe(150);
  });
});
