import { describe, expect, it } from "vitest";
import { chooseShapes, parseCsv, serializeShapes, simplifyShape, type Row } from "./tracados.ts";

// Tudo inventado. Linha de shapes: [lat, lon, seq] como texto.
const pt = (lat: string, lon: string, seq: string): Row => ({ shape_pt_lat: lat, shape_pt_lon: lon, shape_pt_sequence: seq });
const rota = (id: string, nome: string): Row => ({ route_id: id, route_short_name: nome });
const viagem = (id: string, rota_: string, forma: string): Row => ({ route_id: rota_, trip_id: id, shape_id: forma });
const paradas = (trip: string, n: number): Row[] => Array.from({ length: n }, () => ({ trip_id: trip }));
const forma = (id: string): Row => ({ shape_id: id });

describe("parseCsv (C1)", () => {
  it("tira o BOM e aceita CRLF", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n3,4\r\n")).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });
  it("aceita LF, campo com vírgula, aspas escapadas e ignora linha em branco", () => {
    const r = parseCsv('nome,x\n"Rua A, 1",1\n\n"diz ""oi""",2\n');
    expect(r).toEqual([
      { nome: "Rua A, 1", x: "1" },
      { nome: 'diz "oi"', x: "2" },
    ]);
  });
  it("só cabeçalho → lista vazia", () => {
    expect(parseCsv("a,b\r\n")).toEqual([]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("chooseShapes (C2)", () => {
  const routes = [rota("r1", "A")];
  it("escolhe a forma da variante de mais paradas", () => {
    const trips = [viagem("t1", "r1", "curta"), viagem("t2", "r1", "longa")];
    const st = [...paradas("t1", 3), ...paradas("t2", 5)];
    const r = chooseShapes(routes, trips, st, [forma("curta"), forma("longa")]);
    expect(r.escolhas).toEqual([{ rota: "r1", linha: "A", forma: "longa" }]);
    expect(r.avisos).toEqual([]);
    expect(r.erros).toEqual([]);
  });
  it("o shape_id mais frequente da maior variante vence", () => {
    const trips = [viagem("t1", "r1", "x"), viagem("t2", "r1", "y"), viagem("t3", "r1", "y")];
    const st = [...paradas("t1", 4), ...paradas("t2", 4), ...paradas("t3", 4)];
    expect(chooseShapes(routes, trips, st, [forma("x"), forma("y")]).escolhas[0]!.forma).toBe("y");
  });
  it("empate entre dois shape_id → FORMA_EMPATADA", () => {
    const trips = [viagem("t1", "r1", "x"), viagem("t2", "r1", "y")];
    const st = [...paradas("t1", 4), ...paradas("t2", 4)];
    const r = chooseShapes(routes, trips, st, [forma("x"), forma("y")]);
    expect(r.erros.map((e) => e.codigo)).toEqual(["FORMA_EMPATADA"]);
    expect(r.escolhas).toEqual([]);
  });
  it("shape_id que não existe em shapes → FORMA_AUSENTE", () => {
    const r = chooseShapes(routes, [viagem("t1", "r1", "zz")], paradas("t1", 2), [forma("outra")]);
    expect(r.erros.map((e) => e.codigo)).toEqual(["FORMA_AUSENTE"]);
  });
  it("rota sem viagem → ROTA_SEM_VIAGENS e pulada", () => {
    const r = chooseShapes(routes, [], [], []);
    expect(r.avisos.map((e) => e.codigo)).toEqual(["ROTA_SEM_VIAGENS"]);
    expect(r.escolhas).toEqual([]);
  });
  it("viagens da maior variante sem shape_id → ROTA_SEM_FORMA e pulada", () => {
    const trips = [viagem("t1", "r1", ""), viagem("t2", "r1", "x")];
    const st = [...paradas("t1", 5), ...paradas("t2", 2)];
    const r = chooseShapes(routes, trips, st, [forma("x")]);
    expect(r.avisos.map((e) => e.codigo)).toEqual(["ROTA_SEM_FORMA"]);
    expect(r.escolhas).toEqual([]);
  });
  it("ordem natural de route_short_name (2, 10, A), depois route_id", () => {
    const rs = [rota("c", "A"), rota("b", "10"), rota("a", "2"), rota("z", "2")];
    const trips = rs.map((x) => viagem(`t${x.route_id}`, x.route_id!, "f"));
    const st = trips.flatMap((t) => paradas(t.trip_id!, 2));
    expect(chooseShapes(rs, trips, st, [forma("f")]).escolhas.map((e) => `${e.linha}/${e.rota}`)).toEqual(["2/a", "2/z", "10/b", "A/c"]);
  });
});

describe("simplifyShape (C3)", () => {
  const base = [pt("39.00000", "-8.00000", "1"), pt("39.00000", "-7.99900", "3")];
  it("ponto a ~3 m da corda sai; a ~8 m fica", () => {
    expect(simplifyShape([base[0]!, pt("39.00003", "-7.99950", "2"), base[1]!])).toEqual([
      [39, -8],
      [39, -7.999],
    ]);
    expect(simplifyShape([base[0]!, pt("39.00008", "-7.99950", "2"), base[1]!])).toEqual([
      [39, -8],
      [39.00008, -7.9995],
      [39, -7.999],
    ]);
  });
  it("ordena a sequência como número (9, 10, 11), mesmo fora de ordem no texto", () => {
    const r = simplifyShape([pt("39.002", "-8.000", "11"), pt("39.000", "-8.000", "9"), pt("39.001", "-8.001", "10")]);
    expect(r).toEqual([
      [39, -8],
      [39.001, -8.001],
      [39.002, -8],
    ]);
  });
  it("tira ponto repetido seguido", () => {
    const r = simplifyShape([base[0]!, pt("39.00000", "-8.00000", "2"), pt("39.00000", "-7.99900", "4")]);
    expect(r).toEqual([
      [39, -8],
      [39, -7.999],
    ]);
  });
  it("mantém primeiro e último e arredonda para 5 casas", () => {
    const r = simplifyShape([pt("39.123456789", "-8.987654321", "1"), pt("39.2", "-8.9", "2")]);
    expect(r).toEqual([
      [39.12346, -8.98765],
      [39.2, -8.9],
    ]);
  });
  it("coordenada inválida → FORMA_INVALIDA", () => {
    expect(() => simplifyShape([pt("abc", "-8", "1"), pt("39", "-8", "2")])).toThrow(/FORMA_INVALIDA/);
    expect(() => simplifyShape([pt("91", "-8", "1"), pt("39", "-8", "2")])).toThrow(/FORMA_INVALIDA/);
    expect(() => simplifyShape([pt("39", "181", "1"), pt("39", "-8", "2")])).toThrow(/FORMA_INVALIDA/);
  });
  it("menos de 2 pontos distintos → FORMA_CURTA", () => {
    expect(() => simplifyShape([pt("39", "-8", "1")])).toThrow(/FORMA_CURTA/);
    expect(() => simplifyShape([pt("39", "-8", "1"), pt("39", "-8", "2")])).toThrow(/FORMA_CURTA/);
  });
});

describe("serializeShapes (C4)", () => {
  const formas = [
    { rota: "r1", linha: "A", forma: "f1", pontos: [[39, -8], [39.1, -8.1]] as [number, number][] },
    { rota: "r2", linha: "10", forma: "f2", pontos: [[40, -7], [40.1, -7.1]] as [number, number][] },
  ];
  it("determinístico, JSON válido, uma forma por linha, termina em quebra de linha", () => {
    const t = serializeShapes(formas);
    expect(serializeShapes(formas)).toBe(t);
    expect(t.endsWith("\n")).toBe(true);
    const j = JSON.parse(t);
    expect(j.versao).toBe(1);
    expect(j.tolerancia_m).toBe(5);
    expect(j.formas).toEqual(formas);
    expect(t.split("\n").filter((l) => l.includes('"forma"'))).toHaveLength(2);
  });
  it("não leva texto do feed além de rota, linha, forma e números", () => {
    const sp = "Parada Secreta Norte";
    const routes = [{ ...rota("r1", "A"), route_long_name: "Nome Longo Secreto" }];
    const trips = [{ ...viagem("t1", "r1", "f"), trip_headsign: "Destino Secreto" }];
    const st = [{ trip_id: "t1", stop_id: "p1", stop_name: sp }, { trip_id: "t1", stop_id: "p2", stop_name: sp }];
    const sel = chooseShapes(routes, trips, st, [forma("f")]);
    const texto = serializeShapes(sel.escolhas.map((e) => ({ ...e, pontos: simplifyShape([pt("39", "-8", "1"), pt("39.1", "-8", "2")]) })));
    expect(texto).not.toContain("Secret");
    expect(texto).not.toContain(sp);
    expect(texto).toContain('"linha":"A"');
  });
});
