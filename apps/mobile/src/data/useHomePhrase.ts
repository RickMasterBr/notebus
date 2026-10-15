/**
 * Hook da frase viva do Início (E-08.5 Bloco 17, Item 4.2, D-207).
 * Lê provedores e persistência uma única vez e congela a frase por abertura do app.
 */
import { lisbonWallClock } from "@notebus/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { readLastPhraseId, writeLastPhraseId } from "../db/homePhrase";
import { getSharedDb } from "../db/sharedDb";
import { expoPort } from "../notifications/expoPort";
import type { PresentedNotification, ScheduledRequest } from "../notifications/port";
import { lineColors, useTheme } from "../theme";
import { useNow } from "./NowProvider";
import { usePlaces } from "./PlacesProvider";
import { useRegistro } from "./RegistroProvider";
import { useSchedule } from "./ScheduleProvider";
import { useUserName } from "./UserNameProvider";
import { departuresFromNotifications } from "./homeDepartures";
import { homePhraseReady } from "./homePhraseReady";
import { homePhrase, type HomePhrase } from "./homePhrase";

export function useHomePhrase(): { phrase: HomePhrase | null; lineColor: string } {
  const { colors } = useTheme();
  const userName = useUserName();
  const places = usePlaces();
  const registro = useRegistro();
  const schedule = useSchedule();
  const now = useNow();

  const [asyncRead, setAsyncRead] = useState<{
    done: boolean;
    scheduled: ScheduledRequest[];
    presented: PresentedNotification[];
    lastPhraseId: HomePhrase["id"] | null;
  }>({
    done: false,
    scheduled: [],
    presented: [],
    lastPhraseId: null,
  });

  const initiatedAsyncRef = useRef(false);

  useEffect(() => {
    if (initiatedAsyncRef.current) return;
    initiatedAsyncRef.current = true;

    const db = getSharedDb();
    Promise.all([
      expoPort.listScheduled().catch(() => [] as ScheduledRequest[]),
      expoPort.listPresented().catch(() => [] as PresentedNotification[]),
      db ? readLastPhraseId(db).catch(() => null) : Promise.resolve(null),
    ]).then(([scheduled, presented, lastPhraseId]) => {
      setAsyncRead({
        done: true,
        scheduled,
        presented,
        lastPhraseId,
      });
    });
  }, []);

  const ready = homePhraseReady({
    nameLoaded: userName.loaded,
    placesReady: places.status === "ready",
    registroReady: registro.status === "ready",
    scheduleReady: schedule.status === "ready",
    asyncDone: asyncRead.done,
  });

  const frozenRef = useRef(false);
  const [phrase, setPhrase] = useState<HomePhrase | null>(null);

  const loaded = userName.loaded;
  const placesReady = places.status === "ready";
  const registroReady = registro.status === "ready";
  const scheduleReady = schedule.status === "ready";
  const asyncDone = asyncRead.done;

  useEffect(() => {
    if (!ready || frozenRef.current) return;
    frozenRef.current = true;

    const instant = now();
    const lisbonHour = Math.floor(lisbonWallClock(instant).minute / 60);

    const placeCount = places.places.length;
    const hasHomePlace = places.places.some((p) => p.icon === "casa");
    const recordCount = registro.observations.length;
    const inTrip = Boolean(registro.tripCard);

    const departures = departuresFromNotifications({
      scheduled: asyncRead.scheduled,
      presented: asyncRead.presented,
      now: instant,
    });

    const chosen = homePhrase({
      inTrip,
      now: instant,
      hour: lisbonHour,
      name: userName.name,
      departures,
      placeCount,
      hasHomePlace,
      recordCount,
      lastPhraseId: asyncRead.lastPhraseId,
      pick: Math.random(),
    });

    setPhrase(chosen);

    if (chosen !== null) {
      const db = getSharedDb();
      if (db) {
        writeLastPhraseId(db, chosen.id, instant).catch(() => {});
      }
    }
  }, [ready, loaded, placesReady, registroReady, scheduleReady, asyncDone]);

  const lineColor = useMemo(() => {
    if (!phrase?.arriving) return colors.accent;
    const lineId = phrase.arriving.lineId;
    const lineCode = phrase.arriving.lineCode;
    if (schedule.status === "ready") {
      const info = schedule.data.lineInfo.get(lineId);
      if (info?.color) return info.color;
    }
    const known = lineColors[lineCode];
    if (known) return known.color;
    return colors.accent;
  }, [phrase, schedule, colors.accent]);

  return { phrase, lineColor };
}
