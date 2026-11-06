/// <reference types="node" />
/**
 * Guarda estático da ligação do aviso "Reveja este trajeto" no "Ir para" (ideia 242, contrato 07f).
 * GUARDA DE TEXTO: confere o código-fonte (uso), não o efeito no aparelho.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("gotoReviewNoticeWiring: ligação do aviso 'Reveja este trajeto' (ideia 242)", () => {
  it("GotoSheet.tsx importa ../data/gotoUnresolved e ./GotoReviewNotice", () => {
    const gotoSrc = read("sheets/GotoSheet.tsx");
    expect(gotoSrc).toContain('import { unresolvedBusOptionIds } from "../data/gotoUnresolved";');
    expect(gotoSrc).toContain('import { GotoReviewNotice } from "./GotoReviewNotice";');
  });

  it("GotoSheet.tsx chama unresolvedBusOptionIds( e usa <GotoReviewNotice", () => {
    const gotoSrc = read("sheets/GotoSheet.tsx");
    expect(gotoSrc).toContain("unresolvedBusOptionIds(");
    expect(gotoSrc).toContain("<GotoReviewNotice");
  });

  it("GotoReviewNotice.tsx confere pressedStyle, kind: 'route' e as três chaves", () => {
    const noticeSrc = read("sheets/GotoReviewNotice.tsx");
    expect(noticeSrc).toContain("pressedStyle");
    expect(noticeSrc).toContain('kind: "route"');
    expect(noticeSrc).toContain('"sheet_goto.review_route"');
    expect(noticeSrc).toContain('"sheet_goto.review_route.body"');
    expect(noticeSrc).toContain('"sheet_goto.review_route.a11y"');
  });

  it("pt-BR.ts confere as três chaves", () => {
    const ptBrSrc = read("i18n/pt-BR.ts");
    expect(ptBrSrc).toContain('"sheet_goto.review_route": "Reveja este trajeto"');
    expect(ptBrSrc).toContain(
      '"sheet_goto.review_route.body": "Uma opção deste trajeto não existe mais no horário novo. Toque para conferir."',
    );
    expect(ptBrSrc).toContain(
      '"sheet_goto.review_route.a11y": "Reveja este trajeto. Uma opção não existe mais no horário novo. Toque para abrir o trajeto."',
    );
  });

  it("GotoSheet.tsx não contém GotoReviewNotice dentro de um Pressable", () => {
    const gotoSrc = read("sheets/GotoSheet.tsx");
    const pressableRegex = /<Pressable\b[\s\S]*?<\/Pressable>/g;
    const pressableBlocks = gotoSrc.match(pressableRegex) ?? [];
    expect(pressableBlocks.length).toBeGreaterThan(0);
    for (const block of pressableBlocks) {
      expect(block).not.toContain("GotoReviewNotice");
    }
  });
});
