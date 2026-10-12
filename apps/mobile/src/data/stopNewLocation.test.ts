import { describe, expect, it } from "vitest";
import { buildNewStopValues, newStopLocationView } from "./stopNewLocation";

describe("stopNewLocation", () => {
  describe("buildNewStopValues", () => {
    const draft = {
      name: "Paragem Nova",
      externalId: "123",
      note: "Perto da farmácia",
    };
    const aliases = ["Farmácia", "Centro"];

    it("monta o objeto com location intacta quando fornecida", () => {
      const location = { lat: 39.7436, lon: -8.8071 };
      const values = buildNewStopValues(draft, aliases, location);
      expect(values).toEqual({
        name: "Paragem Nova",
        aliases: ["Farmácia", "Centro"],
        externalId: "123",
        note: "Perto da farmácia",
        location: { lat: 39.7436, lon: -8.8071 },
      });
    });

    it("monta o objeto com location null quando ausente", () => {
      const values = buildNewStopValues(draft, aliases, null);
      expect(values).toEqual({
        name: "Paragem Nova",
        aliases: ["Farmácia", "Centro"],
        externalId: "123",
        note: "Perto da farmácia",
        location: null,
      });
    });
  });

  describe("newStopLocationView", () => {
    it("sem localização devolve stop_edit.location.none e canRemove falso", () => {
      const view = newStopLocationView(null);
      expect(view).toEqual({
        statusKey: "stop_edit.location.none",
        openKey: "map_pick.open",
        canRemove: false,
      });
    });

    it("com localização devolve stop_edit.location.manual e canRemove verdadeiro", () => {
      const view = newStopLocationView({ lat: 39.7436, lon: -8.8071 });
      expect(view).toEqual({
        statusKey: "stop_edit.location.manual",
        openKey: "map_pick.open",
        canRemove: true,
      });
    });
  });
});
