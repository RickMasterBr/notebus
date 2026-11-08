/**
 * Achata o modelo da tela Registros (D-396, D-414) nas linhas da lista virtualizada.
 * Função pura: sem React, sem banco, sem relógio.
 */
import type { LineItemModel, TripCardModel } from "./recordsTrips";
import type { RecordsPendingItem, RecordsScreenModel, WeekSummary } from "./recordsScreen";

export type RecordsRow =
  | {
      type: "chips";
      key: "chips";
      lines: { code: string; color: string }[];
      selected: string | null;
    }
  | {
      type: "sectionHeader";
      key: string;
      titleKey: string;
    }
  | {
      type: "now";
      key: string;
      card: TripCardModel;
    }
  | {
      type: "pending";
      key: string;
      item: RecordsPendingItem;
    }
  | {
      type: "seeAll";
      key: "see-all";
      n: number;
    }
  | {
      type: "allChecked";
      key: "all-checked";
    }
  | {
      type: "dayHeader";
      key: string;
      label: string;
      serviceDate: string;
    }
  | {
      type: "trip";
      key: string;
      card: TripCardModel;
      askAlight?: boolean;
    }
  | {
      type: "line";
      key: string;
      item: LineItemModel;
    }
  | {
      type: "week";
      key: string;
      week: WeekSummary;
      expanded: boolean;
    }
  | {
      type: "empty";
      key: "empty";
    };

export function recordsScreenRows(
  model: RecordsScreenModel,
  opts: { lineFilter: string | null },
): RecordsRow[] {
  const hasPastRecords = model.thisWeek.length > 0 || model.olderWeeks.length > 0;
  const hasAnyRecord = Boolean(model.now || hasPastRecords || model.pendingTotal > 0);

  if (!hasAnyRecord) {
    return [{ type: "empty", key: "empty" }];
  }

  const rows: RecordsRow[] = [];

  // Chips: só se model.lines.length > 1
  if (model.lines.length > 1) {
    rows.push({
      type: "chips",
      key: "chips",
      lines: model.lines,
      selected: opts.lineFilter,
    });
  }

  // Agora: seção com o cartão da viagem aberta
  if (model.now) {
    rows.push({
      type: "sectionHeader",
      key: "header-now",
      titleKey: "sheet_records.section.now",
    });
    rows.push({
      type: "now",
      key: `now-${model.now.boardingId}`,
      card: model.now,
    });
  }

  // Para conferir: até 3 de pendingPreview e Ver todas se pendingTotal > 3
  if (model.pendingPreview.length > 0) {
    rows.push({
      type: "sectionHeader",
      key: "header-pending",
      titleKey: "sheet_records.section.pending",
    });
    const pendingToShow = model.pendingPreview.slice(0, 3);
    for (const item of pendingToShow) {
      const key =
        item.kind === "review"
          ? `pending-${item.row.id}`
          : `pending-no-alight-${item.card.boardingId}`;
      rows.push({
        type: "pending",
        key,
        item,
      });
    }
    if (model.pendingTotal > 3) {
      rows.push({
        type: "seeAll",
        key: "see-all",
        n: model.pendingTotal,
      });
    }
  } else if (model.pendingTotal === 0 && hasPastRecords) {
    rows.push({
      type: "allChecked",
      key: "all-checked",
    });
  }

  // Esta semana
  if (model.thisWeek.length > 0) {
    rows.push({
      type: "sectionHeader",
      key: "header-this-week",
      titleKey: "records.this_week",
    });
    for (const day of model.thisWeek) {
      rows.push({
        type: "dayHeader",
        key: `day-${day.serviceDate}`,
        label: day.label,
        serviceDate: day.serviceDate,
      });
      for (const item of day.items) {
        if (item.kind === "trip") {
          rows.push({
            type: "trip",
            key: `trip-${item.boardingId}`,
            card: item,
            askAlight: model.noAlightIds.has(item.boardingId),
          });
        } else {
          rows.push({
            type: "line",
            key: `line-${item.id}`,
            item,
          });
        }
      }
    }
  }

  // Semanas anteriores
  if (model.olderWeeks.length > 0) {
    rows.push({
      type: "sectionHeader",
      key: "header-older-weeks",
      titleKey: "records.older_weeks",
    });
    for (const week of model.olderWeeks) {
      const isExpanded = week.days !== null;
      rows.push({
        type: "week",
        key: `week-${week.weekStart}`,
        week,
        expanded: isExpanded,
      });
      if (isExpanded && week.days) {
        for (const day of week.days) {
          rows.push({
            type: "dayHeader",
            key: `day-${week.weekStart}-${day.serviceDate}`,
            label: day.label,
            serviceDate: day.serviceDate,
          });
          for (const item of day.items) {
            if (item.kind === "trip") {
              rows.push({
                type: "trip",
                key: `trip-${item.boardingId}`,
                card: item,
                askAlight: model.noAlightIds.has(item.boardingId),
              });
            } else {
              rows.push({
                type: "line",
                key: `line-${item.id}`,
                item,
              });
            }
          }
        }
      }
    }
  }

  return rows;
}
