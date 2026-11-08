/// <reference types="node" />
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { testDb } from "../db/testing/drizzleTestDb";
import {
  TRIP_ALIGHT_CHOICE,
  choiceFor,
  chooseTripAlightChoice,
  loadTripAlightChoice,
  onTripAlightChoiceChange,
  readTripAlightChoice,
  tripAlightChoiceSnapshot,
  writeTripAlightChoice,
} from "./tripAlightChoice";

const rowsOf = async (db: ReturnType<typeof testDb>) =>
  (await db.select().from(schema.setting)).filter((row) => row.key === TRIP_ALIGHT_CHOICE);

describe("trip_alight_choice no aparelho (D-393)", () => {
  it("grava e lê a descida escolhida, troca o valor e null apaga", async () => {
    const db = testDb();
    expect(await readTripAlightChoice(db)).toBeNull();

    await writeTripAlightChoice(db, { rideId: "ride-a", position: 5 }, 100);
    expect(await readTripAlightChoice(db)).toEqual({ rideId: "ride-a", position: 5 });

    await writeTripAlightChoice(db, { rideId: "ride-b", position: 7 }, 200);
    expect(await readTripAlightChoice(db)).toEqual({ rideId: "ride-b", position: 7 });
    expect(await rowsOf(db)).toHaveLength(1); // troca a mesma chave, não duplica

    await writeTripAlightChoice(db, null, 300);
    expect(await readTripAlightChoice(db)).toBeNull();
    expect(await rowsOf(db)).toHaveLength(1);
  });

  it("valor inválido vale null", async () => {
    const db = testDb();
    await writeTripAlightChoice(db, null, 10);
    const put = async (value: unknown) => {
      await db.update(schema.setting).set({ value: value as never });
    };

    await put([1, 2]);
    expect(await readTripAlightChoice(db)).toBeNull();

    await put(5);
    expect(await readTripAlightChoice(db)).toBeNull();

    await put("{não é json");
    expect(await readTripAlightChoice(db)).toBeNull();

    await put({ position: 5 });
    expect(await readTripAlightChoice(db)).toBeNull();

    await put({ rideId: 5, position: 5 });
    expect(await readTripAlightChoice(db)).toBeNull();

    await put({ rideId: "ride-a", position: 5.5 });
    expect(await readTripAlightChoice(db)).toBeNull();

    await put({ rideId: "ride-a", position: "5" });
    expect(await readTripAlightChoice(db)).toBeNull();

    await put({ rideId: "ride-a", position: 0 });
    expect(await readTripAlightChoice(db)).toEqual({ rideId: "ride-a", position: 0 });
  });

  it("choiceFor só devolve a posição quando a viagem guardada é a aberta", () => {
    const stored = { rideId: "ride-a", position: 5 };
    expect(choiceFor(stored, "ride-a")).toBe(5);
    expect(choiceFor(stored, "ride-b")).toBeNull();
    expect(choiceFor(stored, null)).toBeNull();
    expect(choiceFor(null, "ride-a")).toBeNull();
  });

  it("loadTripAlightChoice lê uma vez do banco compartilhado e avisa quem espera", async () => {
    const db = testDb();
    await writeTripAlightChoice(db, { rideId: "ride-a", position: 3 }, 100);
    let calls = 0;
    const remove = onTripAlightChoiceChange(() => {
      calls += 1;
    });

    await loadTripAlightChoice(db);
    remove();
    expect(calls).toBe(1);
    expect(tripAlightChoiceSnapshot()).toEqual({ rideId: "ride-a", position: 3 });
    expect(choiceFor(tripAlightChoiceSnapshot(), "ride-a")).toBe(3);
    expect(choiceFor(tripAlightChoiceSnapshot(), "ride-b")).toBeNull();

    // Nesta sessão já leu: um valor novo no banco não volta a mexer no módulo.
    await writeTripAlightChoice(db, { rideId: "ride-b", position: 7 }, 200);
    await loadTripAlightChoice(db);
    expect(calls).toBe(1);
    expect(tripAlightChoiceSnapshot()).toEqual({ rideId: "ride-a", position: 3 });
  });

  it("chooseTripAlightChoice grava, guarda no módulo e avisa todos os ouvintes", async () => {
    const db = testDb();
    let first = 0;
    let second = 0;
    const removeFirst = onTripAlightChoiceChange(() => {
      first += 1;
    });
    const removeSecond = onTripAlightChoiceChange(() => {
      second += 1;
    });

    await chooseTripAlightChoice(db, "ride-a", 5, 100);
    expect([first, second]).toEqual([1, 1]);
    expect(tripAlightChoiceSnapshot()).toEqual({ rideId: "ride-a", position: 5 });
    expect(await readTripAlightChoice(db)).toEqual({ rideId: "ride-a", position: 5 });

    await chooseTripAlightChoice(db, "ride-a", null, 200);
    expect([first, second]).toEqual([2, 2]);
    expect(tripAlightChoiceSnapshot()).toBeNull();
    expect(await readTripAlightChoice(db)).toBeNull();

    removeFirst();
    removeSecond();
    await chooseTripAlightChoice(db, "ride-a", 7, 300);
    expect([first, second]).toEqual([2, 2]); // já não ouvem
    expect(await readTripAlightChoice(db)).toEqual({ rideId: "ride-a", position: 7 });
  });

  it("sem viagem aberta não grava nem avisa; sem banco, só guarda no módulo", async () => {
    const db = testDb();
    let calls = 0;
    const remove = onTripAlightChoiceChange(() => {
      calls += 1;
    });

    await chooseTripAlightChoice(db, null, 5, 100);
    expect(calls).toBe(0);
    expect(await readTripAlightChoice(db)).toBeNull();

    await chooseTripAlightChoice(null, "ride-a", 4, 200);
    expect(calls).toBe(1);
    expect(tripAlightChoiceSnapshot()).toEqual({ rideId: "ride-a", position: 4 });
    remove();
  });
});
