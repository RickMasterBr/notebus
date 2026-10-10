/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

export function normalize(source: string): string {
  return stripComments(source).replace(/\s+/g, " ");
}

export interface MapPickerWiringCheck {
  callsPickStart: boolean;
  callsTapPin: boolean;
  callsResolvePick: boolean;
  hasModal: boolean;
  hasMapOnPress: boolean;
  hasMapDoubleTapZoom: boolean;
  hasMapOnDidFail: boolean;
  handleFailCallsCancelAndToast: boolean;
  callsTapPinInSetState: boolean;
  callsRunPickResult: boolean;
  askFarHasAlert: boolean;
  cameraHasStartAndMaxZoom: boolean;
  effectCallsShouldResolveStart: boolean;
  effectDeps: boolean;
}

export function checkMapPickerWiring(source: string): MapPickerWiringCheck {
  const clean = stripComments(source);
  const norm = clean.replace(/\s+/g, " ");

  const mapTagMatch = norm.match(/<Map\b([^>]*)>/);
  const mapProps = mapTagMatch?.[1] ?? "";

  const hasMapOnPress = mapProps.includes("onPress={handleMapPress}");
  const hasMapDoubleTapZoom = mapProps.includes("doubleTapZoom={false}");
  const hasMapOnDidFail = mapProps.includes("onDidFailLoadingMap={handleFail}");

  const failMatch = norm.match(/handleFail\s*=\s*useCallback\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[/);
  const failBody = failMatch?.[1] ?? "";
  const handleFailCallsCancelAndToast =
    failBody.includes("onCancel();") &&
    failBody.includes('toast.show({ title: t("map_pick.unavailable") })');

  const callsTapPinInSetState = norm.includes("setState((cur) => tapPin(cur, { lat, lon }))");

  const callsRunPickResult =
    norm.includes("runPickResult(resolvePick(state), {") &&
    norm.includes("onConfirm") &&
    norm.includes("askFar");

  const askFarHasAlert = /askFar:\s*\(p\)\s*=>\s*Alert\.alert\(\s*t\("place\.location\.far"\)/.test(norm);

  const cameraMatch = norm.match(/<Camera\b([^>]*)\/>/);
  const cameraProps = cameraMatch?.[1] ?? "";
  const cameraHasStartAndMaxZoom =
    cameraProps.includes("center: [start.point.lon, start.point.lat]") &&
    cameraProps.includes("zoom: start.zoom") &&
    cameraProps.includes("maxZoom={PICK_MAX_ZOOM}");

  const effectCallsShouldResolveStart = norm.includes("shouldResolveStart({ alreadyResolved: resolvedRef.current, placesReady: places.status === \"ready\" })");

  const effectMatch = norm.match(/shouldResolveStart[\s\S]*?\}\s*,\s*\[(.*?)\]\s*\);/);
  const effectDeps = effectMatch?.[1] !== undefined && effectMatch[1].replace(/\s+/g, "") === "places.status,store";

  return {
    callsPickStart: /\bpickStart\s*\(/.test(clean),
    callsTapPin: /\btapPin\s*\(/.test(clean),
    callsResolvePick: /\bresolvePick\s*\(/.test(clean),
    hasModal: /<Modal\b/.test(clean),
    hasMapOnPress,
    hasMapDoubleTapZoom,
    hasMapOnDidFail,
    handleFailCallsCancelAndToast,
    callsTapPinInSetState,
    callsRunPickResult,
    askFarHasAlert,
    cameraHasStartAndMaxZoom,
    effectCallsShouldResolveStart,
    effectDeps,
  };
}

export interface PlaceSheetWiringCheck {
  hasMapPicker: boolean;
  hasMapPickOpenKey: boolean;
  hasMapPickerWithExisting: boolean;
  onConfirmSetsLat: boolean;
  onConfirmSetsLon: boolean;
  onConfirmClosesPicker: boolean;
}

export function checkPlaceSheetWiring(source: string): PlaceSheetWiringCheck {
  const clean = stripComments(source);
  const norm = clean.replace(/\s+/g, " ");

  const confirmMatch = norm.match(/onConfirm=\{\(p\)\s*=>\s*\{([\s\S]*?)\}\}/);
  const confirmBody = confirmMatch?.[1] ?? "";

  return {
    hasMapPicker: /<MapPicker\b/.test(clean),
    hasMapPickOpenKey: /"map_pick\.open"/.test(clean),
    hasMapPickerWithExisting:
      norm.includes("<MapPicker") &&
      norm.includes("existing={lat !== null && lon !== null ? { lat, lon } : null}"),
    onConfirmSetsLat: confirmBody.includes("setLat(p.lat);"),
    onConfirmSetsLon: confirmBody.includes("setLon(p.lon);"),
    onConfirmClosesPicker: confirmBody.includes("setPickerOpen(false);"),
  };
}

export interface StopMapPickWiringCheck {
  hasMapPicker: boolean;
  callsUndoForStopLocation: boolean;
  savesWithManual: boolean;
  callsApplyStopUndo: boolean;
}

export function checkStopMapPickWiring(source: string): StopMapPickWiringCheck {
  const clean = stripComments(source);
  const norm = clean.replace(/\s+/g, " ");
  return {
    hasMapPicker: /<MapPicker\b/.test(clean),
    callsUndoForStopLocation: norm.includes("undoForStopLocation(previous)"),
    savesWithManual: norm.includes('await locations.save(stopId, p, "manual")'),
    callsApplyStopUndo: norm.includes("applyStopUndo(undo, stopId, locations)"),
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
  it("MapPicker.tsx liga Map, Camera, tapPin, runPickResult e efeito de forma estrita", () => {
    const file = join(__dirname, "../screens/MapPicker.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkMapPickerWiring(content);
    expect(res.callsPickStart, "MapPicker.tsx deve chamar pickStart(").toBe(true);
    expect(res.callsTapPin, "MapPicker.tsx deve chamar tapPin(").toBe(true);
    expect(res.callsResolvePick, "MapPicker.tsx deve chamar resolvePick(").toBe(true);
    expect(res.hasModal, "MapPicker.tsx deve conter <Modal").toBe(true);
    expect(res.hasMapOnPress, "MapPicker.tsx deve ter onPress={handleMapPress} no <Map").toBe(true);
    expect(res.hasMapDoubleTapZoom, "MapPicker.tsx deve ter doubleTapZoom={false} no <Map").toBe(true);
    expect(res.hasMapOnDidFail, "MapPicker.tsx deve ter onDidFailLoadingMap={handleFail} no <Map").toBe(true);
    expect(res.handleFailCallsCancelAndToast, "MapPicker.tsx deve chamar onCancel() e toast em handleFail").toBe(true);
    expect(res.callsTapPinInSetState, "MapPicker.tsx deve atualizar pin via tapPin em setState").toBe(true);
    expect(res.callsRunPickResult, "MapPicker.tsx deve chamar runPickResult com onConfirm e askFar").toBe(true);
    expect(res.askFarHasAlert, "MapPicker.tsx deve exibir Alert.alert no askFar").toBe(true);
    expect(res.cameraHasStartAndMaxZoom, "MapPicker.tsx deve configurar Camera com start e PICK_MAX_ZOOM").toBe(true);
    expect(res.effectCallsShouldResolveStart, "MapPicker.tsx deve usar shouldResolveStart no efeito").toBe(true);
    expect(res.effectDeps, "MapPicker.tsx deve ter deps do efeito iguais a [places.status, store]").toBe(true);
  });

  it("PlaceSheet.tsx contém <MapPicker com existing e onConfirm estrito", () => {
    const file = join(__dirname, "../sheets/PlaceSheet.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkPlaceSheetWiring(content);
    expect(res.hasMapPicker, "PlaceSheet.tsx deve conter <MapPicker").toBe(true);
    expect(res.hasMapPickOpenKey, 'PlaceSheet.tsx deve conter "map_pick.open"').toBe(true);
    expect(res.hasMapPickerWithExisting, "PlaceSheet.tsx deve passar existing condicional para <MapPicker").toBe(true);
    expect(res.onConfirmSetsLat, "PlaceSheet.tsx deve chamar setLat(p.lat) no onConfirm").toBe(true);
    expect(res.onConfirmSetsLon, "PlaceSheet.tsx deve chamar setLon(p.lon) no onConfirm").toBe(true);
    expect(res.onConfirmClosesPicker, "PlaceSheet.tsx deve chamar setPickerOpen(false) no onConfirm").toBe(true);
  });

  it("StopMapPick.tsx liga save com manual, undoForStopLocation e applyStopUndo", () => {
    const file = join(__dirname, "../sheets/StopMapPick.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkStopMapPickWiring(content);
    expect(res.hasMapPicker, "StopMapPick.tsx deve conter <MapPicker").toBe(true);
    expect(res.callsUndoForStopLocation, "StopMapPick.tsx deve chamar undoForStopLocation(").toBe(true);
    expect(res.savesWithManual, 'StopMapPick.tsx deve chamar locations.save(stopId, p, "manual")').toBe(true);
    expect(res.callsApplyStopUndo, "StopMapPick.tsx deve chamar applyStopUndo(undo, stopId, locations)").toBe(true);
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

  it("checkMapPickerWiring falha quando <Map não tem onPress={handleMapPress}", () => {
    const mock = `<Map doubleTapZoom={false} onDidFailLoadingMap={handleFail} />`;
    const res = checkMapPickerWiring(mock);
    expect(res.hasMapOnPress).toBe(false);
  });

  it("checkMapPickerWiring falha quando <Map não tem doubleTapZoom={false}", () => {
    const mock = `<Map onPress={handleMapPress} onDidFailLoadingMap={handleFail} />`;
    const res = checkMapPickerWiring(mock);
    expect(res.hasMapDoubleTapZoom).toBe(false);
  });

  it("checkMapPickerWiring falha quando <Map não tem onDidFailLoadingMap={handleFail}", () => {
    const mock = `<Map onPress={handleMapPress} doubleTapZoom={false} />`;
    const res = checkMapPickerWiring(mock);
    expect(res.hasMapOnDidFail).toBe(false);
  });

  it("checkMapPickerWiring falha quando handleFail não chama onCancel", () => {
    const mock = `
      const handleFail = useCallback(() => {
        toast.show({ title: t("map_pick.unavailable") });
      }, [toast]);
    `;
    const res = checkMapPickerWiring(mock);
    expect(res.handleFailCallsCancelAndToast).toBe(false);
  });

  it("checkMapPickerWiring falha quando tapPin não é usado diretamente em setState", () => {
    const mock = `
      setState((cur) => {
        tapPin(cur, { lat, lon });
        return { pin: { lat, lon } };
      });
    `;
    const res = checkMapPickerWiring(mock);
    expect(res.callsTapPinInSetState).toBe(false);
  });

  it("checkMapPickerWiring falha quando askFar não exibe Alert.alert", () => {
    const mock = `
      runPickResult(resolvePick(state), {
        onConfirm,
        askFar: (p) => onConfirm(p),
      });
    `;
    const res = checkMapPickerWiring(mock);
    expect(res.askFarHasAlert).toBe(false);
  });

  it("checkMapPickerWiring falha quando Camera não tem zoom: start.zoom", () => {
    const mock = `
      <Camera
        initialViewState={{
          center: [start.point.lon, start.point.lat],
          zoom: 12,
        }}
        maxZoom={PICK_MAX_ZOOM}
      />
    `;
    const res = checkMapPickerWiring(mock);
    expect(res.cameraHasStartAndMaxZoom).toBe(false);
  });

  it("checkMapPickerWiring falha quando efeito tem dependências extras", () => {
    const mock = `
      useEffect(() => {
        if (!shouldResolveStart({ alreadyResolved: resolvedRef.current, placesReady: places.status === "ready" })) return;
      }, [existing, places.places, places.status, store]);
    `;
    const res = checkMapPickerWiring(mock);
    expect(res.effectDeps).toBe(false);
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

  it("checkPlaceSheetWiring falha quando onConfirm não chama setLat", () => {
    const mock = `
      <MapPicker
        visible={pickerOpen}
        existing={lat !== null && lon !== null ? { lat, lon } : null}
        onConfirm={(p) => {
          setLon(p.lon);
          setPickerOpen(false);
        }}
      />
    `;
    const res = checkPlaceSheetWiring(mock);
    expect(res.onConfirmSetsLat).toBe(false);
  });

  it("checkPlaceSheetWiring falha quando onConfirm não chama setPickerOpen(false)", () => {
    const mock = `
      <MapPicker
        visible={pickerOpen}
        existing={lat !== null && lon !== null ? { lat, lon } : null}
        onConfirm={(p) => {
          setLat(p.lat);
          setLon(p.lon);
        }}
      />
    `;
    const res = checkPlaceSheetWiring(mock);
    expect(res.onConfirmClosesPicker).toBe(false);
  });

  it("checkStopMapPickWiring falha quando <MapPicker não está presente", () => {
    const mock = `undoForStopLocation(previous); locations.save(stopId, p, "manual");`;
    const res = checkStopMapPickWiring(mock);
    expect(res.hasMapPicker).toBe(false);
  });

  it("checkStopMapPickWiring falha quando undoForStopLocation não é chamado", () => {
    const mock = `<MapPicker />; locations.save(stopId, p, "manual");`;
    const res = checkStopMapPickWiring(mock);
    expect(res.callsUndoForStopLocation).toBe(false);
  });

  it("checkStopMapPickWiring falha quando locations.save com manual não está presente", () => {
    const mock = `<MapPicker />; undoForStopLocation(previous); locations.save(stopId, p, "suggested");`;
    const res = checkStopMapPickWiring(mock);
    expect(res.savesWithManual).toBe(false);
  });

  it("checkStopMapPickWiring falha quando applyStopUndo não é chamado", () => {
    const mock = `<MapPicker />; undoForStopLocation(previous); await locations.save(stopId, p, "manual"); undefined;`;
    const res = checkStopMapPickWiring(mock);
    expect(res.callsApplyStopUndo).toBe(false);
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
