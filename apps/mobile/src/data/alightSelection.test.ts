import { describe, expect, it } from "vitest";
import {
  filterAlightStops,
  formatAlightSubtitle,
  shouldCheckWalkAfterAlight,
} from "./alightSelection";

describe("T-48: Lógica da descida (alightSelection)", () => {
  it("(a) só paragens após o embarque, na ordem do percurso", () => {
    const stops = [
      { position: 1, stopId: "s1" },
      { position: 5, stopId: "s5" },
      { position: 17, stopId: "s17" },
      { position: 2, stopId: "s2" },
      { position: 51, stopId: "s51" },
    ];

    // Embarque na posição 5: devem vir apenas 17 e 51, ordenadas por percurso
    const result = filterAlightStops(stops, 5);
    expect(result).toEqual([
      { position: 17, stopId: "s17" },
      { position: 51, stopId: "s51" },
    ]);

    // Embarque no fim: vazio
    expect(filterAlightStops(stops, 51)).toEqual([]);
  });

  it("(b) a passagem repetida vem marcada '2ª passagem'", () => {
    const formatPass = (ordinal: string, dest: string) => `${ordinal} passagem · segue para a ${dest}`;
    const endText = "fim do percurso";

    // 2ª passagem
    const sub2 = formatAlightSubtitle(
      { passageNumber: 2, isLast: false, destinationName: "Estação" },
      formatPass,
      endText,
    );
    expect(sub2).toBe("2ª passagem · segue para a Estação");

    // 3ª passagem
    const sub3 = formatAlightSubtitle(
      { passageNumber: 3, isLast: false, destinationName: "Hospital" },
      formatPass,
      endText,
    );
    expect(sub3).toBe("3ª passagem · segue para a Hospital");

    // Fim de percurso sem repetição
    const subLast = formatAlightSubtitle(
      { passageNumber: 1, isLast: true },
      formatPass,
      endText,
    );
    expect(subLast).toBe("fim do percurso");

    // Passagem normal única no meio
    const subNormal = formatAlightSubtitle(
      { passageNumber: 1, isLast: false },
      formatPass,
      endText,
    );
    expect(subNormal).toBeNull();
  });

  it("(c) trocar a descida liga o 'para conferir' de 'a pé depois da descida', e mexer no valor ou gravar o desliga", () => {
    // 1. Trocou a descida (de ps-1 para ps-2): liga
    expect(
      shouldCheckWalkAfterAlight({
        initialAlightPatternStopId: "ps-1",
        currentAlightPatternStopId: "ps-2",
        walkValueEdited: false,
        isSaved: false,
      }),
    ).toBe(true);

    // 2. Não trocou a descida: continua desligado
    expect(
      shouldCheckWalkAfterAlight({
        initialAlightPatternStopId: "ps-1",
        currentAlightPatternStopId: "ps-1",
        walkValueEdited: false,
        isSaved: false,
      }),
    ).toBe(false);

    // 3. Trocou a descida, mas mexeu no valor do tempo a pé: desliga
    expect(
      shouldCheckWalkAfterAlight({
        initialAlightPatternStopId: "ps-1",
        currentAlightPatternStopId: "ps-2",
        walkValueEdited: true,
        isSaved: false,
      }),
    ).toBe(false);

    // 4. Trocou a descida, mas gravou a opção: desliga
    expect(
      shouldCheckWalkAfterAlight({
        initialAlightPatternStopId: "ps-1",
        currentAlightPatternStopId: "ps-2",
        walkValueEdited: false,
        isSaved: true,
      }),
    ).toBe(false);
  });
});
