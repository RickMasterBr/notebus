/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

export interface MapPickerWiringCheck {
  callsPickStart: boolean;
  callsTapPin: boolean;
  callsResolvePick: boolean;
  hasModal: boolean;
}

export function checkMapPickerWiring(source: string): MapPickerWiringCheck {
  const clean = stripComments(source);
  return {
    callsPickStart: /\bpickStart\s*\(/.test(clean),
    callsTapPin: /\btapPin\s*\(/.test(clean),
    callsResolvePick: /\bresolvePick\s*\(/.test(clean),
    hasModal: /<Modal\b/.test(clean),
  };
}

export interface PlaceSheetWiringCheck {
  hasMapPicker: boolean;
  hasMapPickOpenKey: boolean;
}

export function checkPlaceSheetWiring(source: string): PlaceSheetWiringCheck {
  const clean = stripComments(source);
  return {
    hasMapPicker: /<MapPicker\b/.test(clean),
    hasMapPickOpenKey: /"map_pick\.open"/.test(clean),
  };
}

export interface StopMapPickWiringCheck {
  hasMapPicker: boolean;
  callsUndoForStopLocation: boolean;
  savesWithManual: boolean;
}

export function checkStopMapPickWiring(source: string): StopMapPickWiringCheck {
  const clean = stripComments(source);
  return {
    hasMapPicker: /<MapPicker\b/.test(clean),
    callsUndoForStopLocation: /\bundoForStopLocation\s*\(/.test(clean),
    savesWithManual: /locations\.save\(\s*stopId\s*,\s*p\s*,\s*["']manual["']\s*\)/.test(clean),
  };
}

export interface StopSheetWiringCheck {
  hasStopMapPick: boolean;
}

export function checkStopSheetWiring(source: string): StopSheetWiringCheck {
  const clean = stripComments(source);
  return {
    hasStopMapPick: /<StopMapPick\b/.test(clean),
  };
}

export interface StopLocationsProviderWiringCheck {
  savesWithSource: boolean;
}

export function checkStopLocationsProviderWiring(source: string): StopLocationsProviderWiringCheck {
  const clean = stripComments(source);
  return {
    savesWithSource: /saveStopLocation\(\s*db\s*,\s*stopId\s*,\s*point\s*,\s*source\s*,/.test(clean),
  };
}

describe("guarda estático de ligação do seletor no mapa (Item 5)", () => {
  it("MapPicker.tsx chama pickStart(, tapPin(, resolvePick( e contém <Modal", () => {
    const file = join(__dirname, "../screens/MapPicker.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkMapPickerWiring(content);
    expect(res.callsPickStart, "MapPicker.tsx deve chamar pickStart(").toBe(true);
    expect(res.callsTapPin, "MapPicker.tsx deve chamar tapPin(").toBe(true);
    expect(res.callsResolvePick, "MapPicker.tsx deve chamar resolvePick(").toBe(true);
    expect(res.hasModal, "MapPicker.tsx deve conter <Modal").toBe(true);
  });

  it("PlaceSheet.tsx contém <MapPicker e map_pick.open", () => {
    const file = join(__dirname, "../sheets/PlaceSheet.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkPlaceSheetWiring(content);
    expect(res.hasMapPicker, "PlaceSheet.tsx deve conter <MapPicker").toBe(true);
    expect(res.hasMapPickOpenKey, 'PlaceSheet.tsx deve conter "map_pick.open"').toBe(true);
  });

  it("StopMapPick.tsx contém <MapPicker, undoForStopLocation( e locations.save(stopId, p, manual)", () => {
    const file = join(__dirname, "../sheets/StopMapPick.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkStopMapPickWiring(content);
    expect(res.hasMapPicker, "StopMapPick.tsx deve conter <MapPicker").toBe(true);
    expect(res.callsUndoForStopLocation, "StopMapPick.tsx deve chamar undoForStopLocation(").toBe(true);
    expect(res.savesWithManual, 'StopMapPick.tsx deve chamar locations.save(stopId, p, "manual")').toBe(true);
  });

  it("StopSheet.tsx contém <StopMapPick", () => {
    const file = join(__dirname, "../sheets/StopSheet.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkStopSheetWiring(content);
    expect(res.hasStopMapPick, "StopSheet.tsx deve conter <StopMapPick").toBe(true);
  });

  it("StopLocationsProvider.tsx contém saveStopLocation(db, stopId, point, source,", () => {
    const file = join(__dirname, "./StopLocationsProvider.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkStopLocationsProviderWiring(content);
    expect(res.savesWithSource, "StopLocationsProvider.tsx deve conter saveStopLocation(db, stopId, point, source,").toBe(true);
  });
});

describe("testes de falha das verificações em texto de exemplo", () => {
  it("checkMapPickerWiring falha quando pickStart não é chamado", () => {
    const mock = `<Modal><Map /></Modal>`;
    const res = checkMapPickerWiring(mock);
    expect(res.callsPickStart).toBe(false);
  });

  it("checkMapPickerWiring falha quando tapPin não é chamado", () => {
    const mock = `pickStart(); resolvePick(); <Modal />`;
    const res = checkMapPickerWiring(mock);
    expect(res.callsTapPin).toBe(false);
  });

  it("checkMapPickerWiring falha quando resolvePick não é chamado", () => {
    const mock = `pickStart(); tapPin(); <Modal />`;
    const res = checkMapPickerWiring(mock);
    expect(res.callsResolvePick).toBe(false);
  });

  it("checkMapPickerWiring falha quando <Modal não está presente", () => {
    const mock = `pickStart(); tapPin(); resolvePick(); <View />`;
    const res = checkMapPickerWiring(mock);
    expect(res.hasModal).toBe(false);
  });

  it("checkPlaceSheetWiring falha quando <MapPicker não está presente", () => {
    const mock = `t("map_pick.open"); <View />`;
    const res = checkPlaceSheetWiring(mock);
    expect(res.hasMapPicker).toBe(false);
  });

  it("checkPlaceSheetWiring falha quando map_pick.open não está presente", () => {
    const mock = `<MapPicker visible={true} />`;
    const res = checkPlaceSheetWiring(mock);
    expect(res.hasMapPickOpenKey).toBe(false);
  });

  it("checkStopMapPickWiring falha quando <MapPicker não está presente", () => {
    const mock = `undoForStopLocation(prev); locations.save(stopId, p, "manual");`;
    const res = checkStopMapPickWiring(mock);
    expect(res.hasMapPicker).toBe(false);
  });

  it("checkStopMapPickWiring falha quando undoForStopLocation não é chamado", () => {
    const mock = `<MapPicker />; locations.save(stopId, p, "manual");`;
    const res = checkStopMapPickWiring(mock);
    expect(res.callsUndoForStopLocation).toBe(false);
  });

  it("checkStopMapPickWiring falha quando locations.save com manual não está presente", () => {
    const mock = `<MapPicker />; undoForStopLocation(prev); locations.save(stopId, p, "suggested");`;
    const res = checkStopMapPickWiring(mock);
    expect(res.savesWithManual).toBe(false);
  });

  it("checkStopSheetWiring falha quando <StopMapPick não está presente", () => {
    const mock = `<StopLocationOffer stopId={stopId} />`;
    const res = checkStopSheetWiring(mock);
    expect(res.hasStopMapPick).toBe(false);
  });

  it("checkStopLocationsProviderWiring falha quando saveStopLocation não repassa source", () => {
    const mock = `saveStopLocation(db, stopId, point, "suggested", now());`;
    const res = checkStopLocationsProviderWiring(mock);
    expect(res.savesWithSource).toBe(false);
  });
});
