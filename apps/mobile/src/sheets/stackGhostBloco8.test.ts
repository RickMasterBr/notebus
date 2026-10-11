import { describe, expect, it } from "vitest";
import { homeLayerPointerEvents } from "./diagLog";
import {
  activeSheet,
  initialSheetState,
  sheetReducer,
  stackedSheets,
} from "./stack";

describe("stackGhostBloco8: sequência do Rick e variações (Item 1.1)", () => {
  const runRickPrefix = () => {
    let state = initialSheetState;
    // Início > engrenagem > Ajustes
    state = sheetReducer(state, { type: "push", sheet: { kind: "settings" } });
    const settingsId = activeSheet(state).id;

    // Ajustes > Linhas e pontos
    state = sheetReducer(state, { type: "push", sheet: { kind: "network" } });
    const networkId = activeSheet(state).id;

    // Linhas e pontos > + Novo ponto
    state = sheetReducer(state, { type: "push", sheet: { kind: "stopEdit", stopId: "__new__" } });
    const stopEditId1 = activeSheet(state).id;

    // Salvar (a folha fecha sozinha)
    state = sheetReducer(state, { type: "close", id: stopEditId1 });

    // de novo + Novo ponto
    state = sheetReducer(state, { type: "push", sheet: { kind: "stopEdit", stopId: "__new__" } });
    const stopEditId2 = activeSheet(state).id;

    // Salvar (a folha fecha sozinha)
    state = sheetReducer(state, { type: "close", id: stopEditId2 });

    return { state, settingsId, networkId, stopEditId1, stopEditId2 };
  };

  it("sequência do Rick em ordem certa: fecha network e depois settings, pilha termina em [home] e home=box-none", () => {
    let { state, settingsId, networkId } = runRickPrefix();

    // Fecha Linhas e pontos (network) e depois Ajustes (settings)
    state = sheetReducer(state, { type: "close", id: networkId });
    state = sheetReducer(state, { type: "close", id: settingsId });

    expect(state.stack).toEqual([{ id: 0, kind: "home" }]);
    expect(stackedSheets(state)).toEqual([]);
    expect(homeLayerPointerEvents(stackedSheets(state).length)).toBe("box-none");
  });

  it("variação em dobro: fechamentos repetidos não derrubam folhas erradas e terminam em [home] e home=box-none", () => {
    let { state, settingsId, networkId, stopEditId2 } = runRickPrefix();

    // Fecha stopEdit de novo (em dobro)
    state = sheetReducer(state, { type: "close", id: stopEditId2 });

    // Fecha network em dobro
    state = sheetReducer(state, { type: "close", id: networkId });
    state = sheetReducer(state, { type: "close", id: networkId });

    // Fecha settings em dobro
    state = sheetReducer(state, { type: "close", id: settingsId });
    state = sheetReducer(state, { type: "close", id: settingsId });

    expect(state.stack).toEqual([{ id: 0, kind: "home" }]);
    expect(stackedSheets(state)).toEqual([]);
    expect(homeLayerPointerEvents(stackedSheets(state).length)).toBe("box-none");
  });

  it("variação de dois pedidos quase juntos: fechamento sequencial de network e settings termina em [home] e home=box-none", () => {
    let { state, settingsId, networkId } = runRickPrefix();

    // Dois pedidos fechando o topo e a folha seguinte
    state = sheetReducer(state, { type: "close", id: networkId });
    state = sheetReducer(state, { type: "close", id: settingsId });

    expect(state.stack).toEqual([{ id: 0, kind: "home" }]);
    expect(stackedSheets(state)).toEqual([]);
    expect(homeLayerPointerEvents(stackedSheets(state).length)).toBe("box-none");
  });

  // (a) Reprodução: se os pedidos de fechamento chegarem em ordem trocada (id de baixo antes do de cima),
  // o reducer ignora o fechamento fora do topo (regra D-027). A folha de baixo permanece na pilha e,
  // após o topo fechar, vira folha fantasma com pointerEvents='none' na Home, travando a gaveta.
  it.fails("ordem errada (id de baixo antes do topo): reducer ignora o fechamento e folha sobra na pilha", () => {
    let { state, settingsId, networkId } = runRickPrefix();

    // Fecha settings (embaixo) antes de network (no topo): o reducer ignora
    state = sheetReducer(state, { type: "close", id: settingsId });
    // Fecha network (no topo): network sai, mas settings ficou
    state = sheetReducer(state, { type: "close", id: networkId });

    // Falha: a pilha NÃO termina em [home], pois settings sobrou
    expect(stackedSheets(state)).toEqual([]);
    expect(homeLayerPointerEvents(stackedSheets(state).length)).toBe("box-none");
  });
});
