import { describe, expect, it } from "vitest";
import {
  homePhrase,
  selectInvite,
  type HomePhraseId,
  type InvitePhraseId,
  type PhraseDeparture,
} from "./homePhrase";

function makeDeparture(overrides: Partial<PhraseDeparture> = {}): PhraseDeparture {
  return {
    lineId: "line-1",
    lineCode: "1",
    stopName: "Arrabalde da Ponte",
    placeId: "place-facul",
    beAtStopAt: 1_700_000_000_000 + 7 * 60_000,
    busAt: 1_700_000_000_000 + 9 * 60_000,
    ...overrides,
  };
}

describe("homePhrase (Item 1, D-207, ideia 50)", () => {
  const BASE_NOW = 1_700_000_000_000;

  describe("Regra 1: em viagem", () => {
    it("em viagem retorna null mesmo com ônibus chegando", () => {
      const dep = makeDeparture({
        busAt: BASE_NOW + 9 * 60_000,
        beAtStopAt: BASE_NOW + 7 * 60_000,
      });
      const result = homePhrase({
        inTrip: true,
        now: BASE_NOW,
        hour: 14,
        name: "Richard",
        departures: [dep],
        placeCount: 2,
        hasHomePlace: true,
        recordCount: 5,
        lastPhraseId: null,
        pick: 0,
      });
      expect(result).toBeNull();
    });
  });

  describe("Regra 2: ônibus chegando", () => {
    it("ônibus a 9 min: 'minutos' com n = 9 e arriving preenchido", () => {
      const dep = makeDeparture({
        busAt: BASE_NOW + 9 * 60_000,
        beAtStopAt: BASE_NOW + 7 * 60_000,
      });
      const result = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: "Richard",
        departures: [dep],
        placeCount: 2,
        hasHomePlace: true,
        recordCount: 5,
        lastPhraseId: null,
        pick: 0,
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe("arriving_minutes");
      expect(result?.headline).toBe("Seu ônibus chega em 9 minutos");
      expect(result?.arriving).toEqual(dep);
      expect(result?.eyebrow).toBe("Boa tarde, Richard");
    });

    it("ônibus a 9 min e 1 s: teto n = 10", () => {
      const dep = makeDeparture({
        busAt: BASE_NOW + 9 * 60_000 + 1_000,
        beAtStopAt: BASE_NOW + 7 * 60_000,
      });
      const result = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: "Richard",
        departures: [dep],
        placeCount: 2,
        hasHomePlace: true,
        recordCount: 5,
        lastPhraseId: null,
        pick: 0,
      });
      expect(result?.id).toBe("arriving_minutes");
      expect(result?.headline).toBe("Seu ônibus chega em 10 minutos");
    });

    it("ônibus a 1 min: forma singular", () => {
      const dep = makeDeparture({
        busAt: BASE_NOW + 60_000,
        beAtStopAt: BASE_NOW + 30_000,
      });
      const result = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: "Richard",
        departures: [dep],
        placeCount: 2,
        hasHomePlace: true,
        recordCount: 5,
        lastPhraseId: null,
        pick: 0,
      });
      expect(result?.id).toBe("arriving_minutes");
      expect(result?.headline).toBe("Seu ônibus chega em 1 minuto");
    });

    it("ônibus a exatos 30 min: entra na janela de 30 min", () => {
      // janela de 30 min = 30 * 60000 ms
      const dep = makeDeparture({
        busAt: BASE_NOW + 30 * 60_000,
        beAtStopAt: BASE_NOW + 25 * 60_000,
      });
      const result = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [dep],
        placeCount: 2,
        hasHomePlace: true,
        recordCount: 5,
        lastPhraseId: null,
        pick: 0,
      });
      expect(result?.id).toBe("arriving_minutes");
      expect(result?.headline).toBe("Seu ônibus chega em 30 minutos");
      expect(result?.eyebrow).toBe("Boa tarde");
    });

    it("ônibus a 30 min e 1 s: fora da janela de 30 min -> cai para convite", () => {
      const dep = makeDeparture({
        busAt: BASE_NOW + 30 * 60_000 + 1_000,
        beAtStopAt: BASE_NOW + 25 * 60_000,
      });
      const result = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [dep],
        placeCount: 0,
        hasHomePlace: false,
        recordCount: 1,
        lastPhraseId: null,
        pick: 0,
      });
      // Com placeCount: 0, recordCount: 1, tarde -> apenas where e line
      expect(result?.id).toBe("invite_where");
      expect(result?.arriving).toBeNull();
    });

    it("now >= beAtStopAt dentro da margem: arriving_leave ('Hora de sair para o ponto')", () => {
      // Exato beAtStopAt
      const depExact = makeDeparture({
        busAt: BASE_NOW + 5 * 60_000,
        beAtStopAt: BASE_NOW,
      });
      const resExact = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: "Richard",
        departures: [depExact],
        placeCount: 2,
        hasHomePlace: true,
        recordCount: 5,
        lastPhraseId: null,
        pick: 0,
      });
      expect(resExact?.id).toBe("arriving_leave");
      expect(resExact?.headline).toBe("Hora de sair para o ponto");
      expect(resExact?.arriving).toEqual(depExact);

      // now após beAtStopAt (já passou o 'esteja no ponto às')
      const depPast = makeDeparture({
        busAt: BASE_NOW + 4 * 60_000,
        beAtStopAt: BASE_NOW - 60_000,
      });
      const resPast = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: "Richard",
        departures: [depPast],
        placeCount: 2,
        hasHomePlace: true,
        recordCount: 5,
        lastPhraseId: null,
        pick: 0,
      });
      expect(resPast?.id).toBe("arriving_leave");
      expect(resPast?.headline).toBe("Hora de sair para o ponto");
    });

    it("ônibus com busAt <= now é descartado", () => {
      const depPast = makeDeparture({
        busAt: BASE_NOW,
        beAtStopAt: BASE_NOW - 5 * 60_000,
      });
      const result = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [depPast],
        placeCount: 0,
        hasHomePlace: false,
        recordCount: 1,
        lastPhraseId: null,
        pick: 0,
      });
      expect(result?.id).toBe("invite_where");
      expect(result?.arriving).toBeNull();
    });

    it("dois ônibus elegíveis: escolhe o de menor busAt", () => {
      const depNear = makeDeparture({
        lineCode: "1",
        busAt: BASE_NOW + 8 * 60_000,
        beAtStopAt: BASE_NOW + 6 * 60_000,
      });
      const depFar = makeDeparture({
        lineCode: "2",
        busAt: BASE_NOW + 15 * 60_000,
        beAtStopAt: BASE_NOW + 12 * 60_000,
      });
      // Passados na ordem inversa
      const result = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: "Richard",
        departures: [depFar, depNear],
        placeCount: 2,
        hasHomePlace: true,
        recordCount: 5,
        lastPhraseId: null,
        pick: 0,
      });
      expect(result?.id).toBe("arriving_minutes");
      expect(result?.headline).toBe("Seu ônibus chega em 8 minutos");
      expect(result?.arriving?.lineCode).toBe("1");
    });
  });

  describe("Regra 3: convites", () => {
    it("ordem do catálogo: where, line sempre; pick = 0 pega primeiro e pick = 0.999 pega o último", () => {
      // Condições base: sem outros elegíveis (placeCount < 2, tarde, recordCount > 0)
      // Elegíveis: where, line
      const resFirst = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [],
        placeCount: 1,
        hasHomePlace: false,
        recordCount: 2,
        lastPhraseId: null,
        pick: 0,
      });
      expect(resFirst?.id).toBe("invite_where");
      expect(resFirst?.headline).toBe("Para onde vamos hoje?");

      const resLast = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [],
        placeCount: 1,
        hasHomePlace: false,
        recordCount: 2,
        lastPhraseId: null,
        pick: 0.999,
      });
      expect(resLast?.id).toBe("invite_line");
      expect(resLast?.headline).toBe("Qual linha você vai pegar?");
    });

    it("faculty_or_home só com placeCount >= 2", () => {
      // Com placeCount = 1: elegíveis = [where, line]
      const res1 = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [],
        placeCount: 1,
        hasHomePlace: false,
        recordCount: 2,
        lastPhraseId: null,
        pick: 0.999,
      });
      expect(res1?.id).toBe("invite_line");

      // Com placeCount = 2: elegíveis = [where, line, faculty_or_home]
      const res2 = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [],
        placeCount: 2,
        hasHomePlace: false,
        recordCount: 2,
        lastPhraseId: null,
        pick: 0.999,
      });
      expect(res2?.id).toBe("invite_faculty_or_home");
      expect(res2?.headline).toBe("Vai para a Facul ou para casa?");
    });

    it("first_bus só de manhã (greetingPeriod === 'morning')", () => {
      // Manhã (hour = 8): elegíveis = [where, line, first_bus]
      const resMorning = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 8,
        name: null,
        departures: [],
        placeCount: 1,
        hasHomePlace: false,
        recordCount: 2,
        lastPhraseId: null,
        pick: 0.999,
      });
      expect(resMorning?.id).toBe("invite_first_bus");
      expect(resMorning?.headline).toBe("Primeiro ônibus do dia?");

      // Tarde (hour = 14): first_bus não entra
      const resAfternoon = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [],
        placeCount: 1,
        hasHomePlace: false,
        recordCount: 2,
        lastPhraseId: null,
        pick: 0.999,
      });
      expect(resAfternoon?.id).toBe("invite_line");
    });

    it("going_home só à noite E com Casa salva", () => {
      // À noite (hour = 20) com Casa: elegíveis = [where, line, going_home]
      const resNightHome = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 20,
        name: null,
        departures: [],
        placeCount: 1,
        hasHomePlace: true,
        recordCount: 2,
        lastPhraseId: null,
        pick: 0.999,
      });
      expect(resNightHome?.id).toBe("invite_going_home");
      expect(resNightHome?.headline).toBe("Voltando para casa?");

      // À noite sem Casa: going_home não entra
      const resNightNoHome = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 20,
        name: null,
        departures: [],
        placeCount: 1,
        hasHomePlace: false,
        recordCount: 2,
        lastPhraseId: null,
        pick: 0.999,
      });
      expect(resNightNoHome?.id).toBe("invite_line");

      // De dia com Casa: going_home não entra
      const resDayHome = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [],
        placeCount: 1,
        hasHomePlace: true,
        recordCount: 2,
        lastPhraseId: null,
        pick: 0.999,
      });
      expect(resDayHome?.id).toBe("invite_line");
    });

    it("note_next só sem registros (recordCount === 0)", () => {
      // Com recordCount = 0: elegíveis = [where, line, note_next]
      const resZero = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [],
        placeCount: 1,
        hasHomePlace: false,
        recordCount: 0,
        lastPhraseId: null,
        pick: 0.999,
      });
      expect(resZero?.id).toBe("invite_note_next");
      expect(resZero?.headline).toBe("Anote o próximo ônibus que você pegar.");

      // Com recordCount = 1: note_next não entra
      const resOne = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [],
        placeCount: 1,
        hasHomePlace: false,
        recordCount: 1,
        lastPhraseId: null,
        pick: 0.999,
      });
      expect(resOne?.id).toBe("invite_line");
    });
  });

  describe("Regra 4: nunca repete o convite da vez anterior", () => {
    it("lastPhraseId sai da lista de elegíveis quando há outro", () => {
      // Elegíveis padrão: where, line. Com lastPhraseId = "invite_where", sobra apenas line.
      const res = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: null,
        departures: [],
        placeCount: 1,
        hasHomePlace: false,
        recordCount: 2,
        lastPhraseId: "invite_where",
        pick: 0,
      });
      expect(res?.id).toBe("invite_line");
    });

    it("lastPhraseId único elegível fica na lista", () => {
      // Quando só há um elegível e ele coincide com lastPhraseId, ele é mantido para evitar lista vazia
      expect(selectInvite(["where"], "invite_where", 0)).toBe("where");
    });

    it("índice usa Math.min para não estourar lista de 1 item com pick no limite", () => {
      expect(selectInvite(["where"], null, 0.999)).toBe("where");
      expect(selectInvite(["where"], null, 1)).toBe("where");
    });

    it("regra de produto: frase de ônibus pode repetir se de novo há ônibus chegando", () => {
      // Regra de produto: se lastPhraseId é arriving_minutes ou arriving_leave e de novo há ônibus chegando,
      // a frase de ônibus PODE repetir (o dado mudou); a regra 'nunca repete' vale apenas para os convites.
      const dep = makeDeparture({
        busAt: BASE_NOW + 9 * 60_000,
        beAtStopAt: BASE_NOW + 7 * 60_000,
      });
      const res = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: "Richard",
        departures: [dep],
        placeCount: 2,
        hasHomePlace: true,
        recordCount: 5,
        lastPhraseId: "arriving_minutes",
        pick: 0,
      });
      expect(res?.id).toBe("arriving_minutes");
      expect(res?.headline).toBe("Seu ônibus chega em 9 minutos");
    });
  });

  describe("Regra 5 e 6: eyebrow e integridade de texto", () => {
    it("o nome vai exclusivamente no eyebrow e nunca na headline", () => {
      const res = homePhrase({
        inTrip: false,
        now: BASE_NOW,
        hour: 14,
        name: "Richard",
        departures: [],
        placeCount: 1,
        hasHomePlace: false,
        recordCount: 1,
        lastPhraseId: null,
        pick: 0,
      });
      expect(res?.eyebrow).toBe("Boa tarde, Richard");
      expect(res?.headline).toBe("Para onde vamos hoje?");
      expect(res?.headline).not.toContain("Richard");
    });

    it("nenhuma frase tem ponto de exclamação nem emoji", () => {
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/u;
      const testCases = [
        // Horas nos 3 períodos
        { hour: 8, name: "Richard" },
        { hour: 14, name: null },
        { hour: 21, name: "Ana" },
      ];

      for (const tc of testCases) {
        for (let p = 0; p < 1; p += 0.2) {
          for (let placeCount = 0; placeCount <= 2; placeCount++) {
            for (const hasHomePlace of [false, true]) {
              for (const recordCount of [0, 5]) {
                const dep = makeDeparture({
                  busAt: BASE_NOW + 5 * 60_000,
                  beAtStopAt: BASE_NOW + 3 * 60_000,
                });
                const depLeave = makeDeparture({
                  busAt: BASE_NOW + 5 * 60_000,
                  beAtStopAt: BASE_NOW - 60_000,
                });
                for (const departures of [[], [dep], [depLeave]]) {
                  const phrase = homePhrase({
                    inTrip: false,
                    now: BASE_NOW,
                    hour: tc.hour,
                    name: tc.name,
                    departures,
                    placeCount,
                    hasHomePlace,
                    recordCount,
                    lastPhraseId: null,
                    pick: p,
                  });
                  if (!phrase) continue;
                  expect(phrase.headline).not.toContain("!");
                  expect(phrase.eyebrow).not.toContain("!");
                  expect(emojiRegex.test(phrase.headline)).toBe(false);
                  expect(emojiRegex.test(phrase.eyebrow)).toBe(false);
                }
              }
            }
          }
        }
      }
    });
  });
});
