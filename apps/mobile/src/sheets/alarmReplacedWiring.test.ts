/// <reference types="node" />
/**
 * Guarda estático da fiação do aviso de substituição (ideia 230, contrato 07d).
 * GUARDA DE TEXTO: confere o código-fonte (uso), não o efeito no aparelho.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function normalize(source: string): string {
  return source.replace(/\s+/g, " ");
}

const cases = [
  { file: "AlarmsSheet.tsx", calls: 1 },
  { file: "GotoSheet.tsx", calls: 2 },
  { file: "RepeatSheet.tsx", calls: 1 },
];

const sources = cases.map((c) => ({
  ...c,
  src: normalize(readFileSync(join(__dirname, c.file), "utf8")),
}));

describe("alarmReplacedWiring: aviso de substituição só depois de shouldAnnounceReplaced (ideia 230)", () => {
  for (const { file, calls, src } of sources) {
    it(`${file} importa shouldAnnounceReplaced de ../data/alarmReplacedNotice`, () => {
      expect(src).toContain(
        'import { shouldAnnounceReplaced } from "../data/alarmReplacedNotice";',
      );
    });

    it(`${file} tem ${calls} aviso(s) toast.alarm_replaced, todos depois de shouldAnnounceReplaced(`, () => {
      const chunks = src.split("toast.alarm_replaced");
      expect(chunks.length - 1).toBe(calls);
      for (const chunk of chunks.slice(0, -1)) {
        expect(chunk).toContain("shouldAnnounceReplaced(");
      }
    });

    it(`${file} passa o horário do aviso antigo e o relógio real à guarda`, () => {
      expect(src).toContain(
        "shouldAnnounceReplaced(rep, oldAlarm ? oldAlarm.anchorBaseMinute : null, realNow())",
      );
    });
  }
});
