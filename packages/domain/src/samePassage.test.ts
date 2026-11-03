import { describe, expect, it } from "vitest";
import { samePassage as fromIndex } from "./index.ts";
import type { PatternData } from "./passages.ts";
import { samePassage } from "./samePassage.ts";

// Percursos inventados: a lista de pontos por posição (1, 2, 3...).
const pat = (id: string, stopIds: string[]): PatternData => ({
  id,
  stops: stopIds.map((stopId, i) => ({ position: i + 1, stopId, isTimepoint: false })),
});

describe("samePassage: a mesma passagem em outro percurso da família", () => {
  it("é exportada por index.ts", () => {
    expect(fromIndex).toBe(samePassage);
  });

  it("mantém a posição quando o ponto está na mesma ordem", () => {
    expect(samePassage(pat("P-old", ["a", "b", "c"]), 2, pat("P-new", ["a", "b", "c"]))).toBe(2);
  });

  it("acha o ponto em outra posição do percurso novo", () => {
    expect(samePassage(pat("P-old", ["a", "b", "c"]), 3, pat("P-new", ["x", "a", "b", "c"]))).toBe(4);
  });

  it("circular: a 1ª passagem vai para a 1ª e a última para a última, mesmo com o novo de outro tamanho", () => {
    const old = pat("P-old", ["a", "b", "c", "a"]);
    const novo = pat("P-new", ["a", "b", "c", "d", "e", "a"]);
    expect(samePassage(old, 1, novo)).toBe(1);
    expect(samePassage(old, 4, novo)).toBe(6);
  });

  it("ordena por posição, não pela ordem do vetor", () => {
    const old: PatternData = { id: "P-old", stops: [...pat("P-old", ["a", "b", "a"]).stops].reverse() };
    expect(samePassage(old, 3, pat("P-new", ["a", "b", "a"]))).toBe(3);
  });

  it("ponto que saiu do percurso novo: null", () => {
    expect(samePassage(pat("P-old", ["a", "b"]), 2, pat("P-new", ["a", "c"]))).toBeNull();
  });

  it("a k-ésima passagem que o novo não tem: null", () => {
    expect(samePassage(pat("P-old", ["a", "b", "a"]), 3, pat("P-new", ["a", "b"]))).toBeNull();
  });

  it("posição que não existe no antigo: null", () => {
    expect(samePassage(pat("P-old", ["a", "b"]), 9, pat("P-new", ["a", "b"]))).toBeNull();
  });
});
