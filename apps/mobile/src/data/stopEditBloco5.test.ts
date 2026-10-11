import { describe, expect, it } from "vitest";
import {
  MAX_EXTERNAL_ID_LENGTH,
  commitPendingAlias,
  externalIdTooLong,
  stopEditView,
  validateStopEdit,
} from "./stopEdit";

const name = "Praça Inventada";

describe("commitPendingAlias (D8: apelido pendente entra ao Salvar)", () => {
  it("texto vazio ou só espaços não muda nada", () => {
    expect(commitPendingAlias(["A"], "", name)).toEqual({ ok: true, aliases: ["A"] });
    expect(commitPendingAlias(["A"], "   ", name)).toEqual({ ok: true, aliases: ["A"] });
  });

  it("texto válido entra na lista, normalizado", () => {
    expect(commitPendingAlias(["A"], "  Centro   Comercial ", name)).toEqual({ ok: true, aliases: ["A", "Centro Comercial"] });
  });

  it("texto inválido devolve o motivo (igual ao nome, repetido, longo, lista cheia)", () => {
    expect(commitPendingAlias([], "praça inventada", name)).toEqual({ ok: false, reason: "same_as_name" });
    expect(commitPendingAlias(["Shopping"], "shopping", name)).toEqual({ ok: false, reason: "duplicate" });
    expect(commitPendingAlias([], "x".repeat(61), name)).toEqual({ ok: false, reason: "too_long" });
    const ten = Array.from({ length: 10 }, (_, i) => `A${i}`);
    expect(commitPendingAlias(ten, "Novo", name)).toEqual({ ok: false, reason: "too_many" });
  });

  it("não altera a lista original", () => {
    const list = ["A"];
    commitPendingAlias(list, "B", name);
    expect(list).toEqual(["A"]);
  });
});

describe("externalIdTooLong (D9: limite de 20, só quando o ID mudou)", () => {
  it("o limite é 20", () => {
    expect(MAX_EXTERNAL_ID_LENGTH).toBe(20);
  });
  it("20 caracteres passa, 21 não", () => {
    expect(externalIdTooLong("a".repeat(20), null)).toBe(false);
    expect(externalIdTooLong("a".repeat(21), null)).toBe(true);
  });
  it("conta depois de tirar os espaços das pontas", () => {
    expect(externalIdTooLong(`  ${"a".repeat(20)}  `, null)).toBe(false);
  });
  it("ID antigo longo e inalterado não conta (nem com espaços nas pontas)", () => {
    const long = "b".repeat(30);
    expect(externalIdTooLong(long, long)).toBe(false);
    expect(externalIdTooLong(` ${long} `, long)).toBe(false);
  });
  it("ID antigo longo e alterado para outro longo conta", () => {
    expect(externalIdTooLong("c".repeat(30), "b".repeat(30))).toBe(true);
  });
  it("vazio ou nulo nunca conta", () => {
    expect(externalIdTooLong(null, "b".repeat(30))).toBe(false);
    expect(externalIdTooLong("   ", null)).toBe(false);
  });
});

describe("validateStopEdit e stopEditView com o limite do ID externo", () => {
  const base = { name, note: null, aliases: [] as string[], others: [] };
  it("21 caracteres novos: erro externalIdTooLong e o Salvar não liga", () => {
    const input = { ...base, externalId: "a".repeat(21), originalExternalId: null };
    const validation = validateStopEdit(input);
    expect(validation).toEqual({ ok: false, errors: { externalIdTooLong: true } });
    const original = { name, externalId: null, note: null, aliases: [] };
    const view = stopEditView({ original, draft: { ...original, externalId: "a".repeat(21) }, validation });
    expect(view.externalIdTooLong).toBe(true);
    expect(view.canSave).toBe(false);
  });
  it("20 caracteres novos: valida", () => {
    expect(validateStopEdit({ ...base, externalId: "a".repeat(20), originalExternalId: null }).ok).toBe(true);
  });
  it("ID longo que já era do ponto e não mudou: valida (e mexer só na nota liga o Salvar)", () => {
    const long = "b".repeat(30);
    const validation = validateStopEdit({ ...base, externalId: long, originalExternalId: long, note: "oi" });
    expect(validation.ok).toBe(true);
    const original = { name, externalId: long, note: null, aliases: [] };
    const view = stopEditView({ original, draft: { ...original, note: "oi" }, validation });
    expect(view.externalIdTooLong).toBe(false);
    expect(view.canSave).toBe(true);
  });
});

describe("stopEditView com o apelido pendente (D8)", () => {
  const original = { name, externalId: null, note: null, aliases: ["A"] };
  const ok = validateStopEdit({ name, externalId: null, note: null, aliases: ["A"], others: [] });

  it("só o apelido pendente válido muda: o Salvar liga", () => {
    const view = stopEditView({ original, draft: original, validation: ok, pendingAlias: "Novo" });
    expect(view.isChanged).toBe(true);
    expect(view.canSave).toBe(true);
  });
  it("sem texto pendente e sem mudança: o Salvar fica desligado", () => {
    expect(stopEditView({ original, draft: original, validation: ok, pendingAlias: "" }).canSave).toBe(false);
    expect(stopEditView({ original, draft: original, validation: ok, pendingAlias: "   " }).canSave).toBe(false);
    expect(stopEditView({ original, draft: original, validation: ok }).canSave).toBe(false);
  });
  it("só um apelido pendente inválido (igual ao nome) não liga o Salvar", () => {
    const view = stopEditView({ original, draft: original, validation: ok, pendingAlias: "praça inventada" });
    expect(view.canSave).toBe(false);
  });
  it("pendente repetido de um já adicionado não liga o Salvar", () => {
    expect(stopEditView({ original, draft: original, validation: ok, pendingAlias: "a" }).canSave).toBe(false);
  });
  it("pendente válido com o nome inválido não liga o Salvar", () => {
    const bad = validateStopEdit({ name: "", externalId: null, note: null, aliases: ["A"], others: [] });
    const view = stopEditView({ original, draft: { ...original, name: "" }, validation: bad, pendingAlias: "Novo" });
    expect(view.canSave).toBe(false);
  });
});
