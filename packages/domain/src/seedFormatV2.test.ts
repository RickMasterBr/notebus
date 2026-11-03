import { describe, expect, it } from "vitest";
import { officialId } from "./ids.ts";
import { parseSeedFile } from "./seedFormat.ts";

// Semente inventada (D-091): uma linha, um percurso de 2 pontos, um quadro (vigente desde 2026-09-01) e uma viagem.
const row = (key: string) => ({ id: officialId(key), key });

/** `extra` entra na viagem; `stopExtra` entra nos dois pontos; `version` troca o formato. */
function seed(opts: { version?: unknown; trip?: Record<string, unknown>; stop?: Record<string, unknown> } = {}) {
  const stop = (n: number) => ({ ...row(`t/stop/${n}`), name: `Ponto ${n}`, aliases: [], externalId: null, ...opts.stop });
  return {
    format: "notebus.mobilis-seed",
    formatVersion: opts.version ?? 2,
    network: { name: "Rede Inventada", timezone: "Europe/Lisbon" },
    dataset: { name: "teste", version: "2026-09-01" },
    stops: [stop(1), stop(2)],
    lines: [{ ...row("t/line/1"), code: "1", name: "Linha 1", color: "#112233" }],
    patterns: [{ ...row("t/pat/1"), code: "1a", lineId: officialId("t/line/1"), label: "ida", isCircular: false }],
    patternStops: [1, 2].map((n) => ({
      ...row(`t/ps/${n}`), patternId: officialId("t/pat/1"), position: n, stopId: officialId(`t/stop/${n}`), isTimepoint: false, timepointLabel: null,
    })),
    timetables: [{ ...row("t/tt/1"), patternId: officialId("t/pat/1"), validFrom: "2026-09-01", validTo: null }],
    trips: [{
      ...row("t/trip/1"), timetableId: officialId("t/tt/1"), firstPosition: 1, lastPosition: 2,
      dayTypes: ["sunday_holiday"], season: null, sourceTable: 1, ...opts.trip,
    }],
    stopTimes: [1, 2].map((n) => ({
      ...row(`t/st/${n}`), tripId: officialId("t/trip/1"), patternStopId: officialId(`t/ps/${n}`), serviceMinute: 500 + n,
    })),
  };
}

const refused = (s: unknown) => expect(() => parseSeedFile(s)).toThrow();
const v2Trip = (extra: Record<string, unknown>) => seed({ trip: extra });

describe("formato 2 do arquivo", () => {
  it("aceita notOn, alsoOn, include e lat/lon", () => {
    const s = seed({
      trip: { notOn: ["2026-12-25"], alsoOn: ["2026-12-24"], season: { startMd: "07-01", endMd: "08-31", mode: "include" } },
      stop: { lat: 39.74, lon: -8.8 },
    });
    expect(parseSeedFile(s).trips[0]!.notOn).toEqual(["2026-12-25"]);
  });

  it("formato 1 simples segue aceito; 0 e 3 são recusados", () => {
    expect(parseSeedFile(seed({ version: 1 })).formatVersion).toBe(1);
    refused(seed({ version: 0 }));
    refused(seed({ version: 3 }));
  });

  it("formato 1 recusa cada campo novo", () => {
    refused(seed({ version: 1, trip: { notOn: ["2026-12-25"] } }));
    refused(seed({ version: 1, trip: { alsoOn: ["2026-12-24"] } }));
    refused(seed({ version: 1, stop: { lat: 39.7, lon: -8.8 } }));
    refused(seed({ version: 1, trip: { season: { startMd: "07-01", endMd: "08-31", mode: "include" } } }));
  });

  it("formato 2 recusa datas e coordenadas inválidas", () => {
    refused(v2Trip({ notOn: ["2026-02-30"] }));
    refused(v2Trip({ notOn: ["2026-12-25", "2026-12-25"] }));
    refused(v2Trip({ notOn: ["2026-12-25"], alsoOn: ["2026-12-25"] }));
    refused(v2Trip({ notOn: ["2026-08-31"] })); // antes do validFrom do quadro
    refused(v2Trip({ notOn: "2026-12-25" }));
    refused(seed({ stop: { lat: 39.7 } }));
    refused(seed({ stop: { lat: 91, lon: 0 } }));
    refused(seed({ stop: { lat: 0, lon: 181 } }));
    refused(seed({ stop: { lat: "39.7", lon: -8.8 } }));
  });
});
