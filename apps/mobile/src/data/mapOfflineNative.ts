/**
 * Adaptador nativo para gerenciamento e download de pacotes offline do MapLibre (E-07 7b Bloco 6a).
 * É o único arquivo além de MapBackdrop.tsx que importa @maplibre/maplibre-react-native.
 */
import { OfflineManager, type OfflinePack } from "@maplibre/maplibre-react-native";
import { DOMAIN_CONFIG, type OfflineRegion } from "@notebus/domain";
import { MAP_STYLE_DARK, MAP_STYLE_LIGHT } from "./mapStart";
import {
  combineProgress,
  OFFLINE_PACK_DARK,
  OFFLINE_PACK_LIGHT,
  statusFromPacks,
  type OfflineMapStatus,
  type OfflinePackSnapshot,
} from "./mapOfflineState";

export type OfflineProgressCallback = (status: OfflineMapStatus) => void;

/**
 * Consulta a lista nativa de pacotes e retorna o status atual do mapa offline.
 * Devolve:
 * - 'ready' se os dois pacotes (leiria-light e leiria-dark) estão completos (com a soma dos bytes);
 * - 'none' se nenhum existe ou se estão incompletos sem download ativo;
 * - 'downloading' se algum pacote está em andamento;
 * - 'error' se algum falhou.
 */
export async function getOfflineMapStatus(): Promise<OfflineMapStatus> {
  const allPacks: OfflinePack[] = await OfflineManager.getPacks();
  const leiriaPacks = allPacks.filter((p) => {
    const name = (p.metadata?.name as string) ?? (p.metadata?.id as string);
    return name === OFFLINE_PACK_LIGHT || name === OFFLINE_PACK_DARK;
  });

  const snapshots: OfflinePackSnapshot[] = await Promise.all(
    leiriaPacks.map(async (p) => {
      try {
        const s = await p.status();
        return {
          id: p.id,
          name: (p.metadata?.name as string) ?? (p.metadata?.id as string),
          state: s.state,
          percentage: s.percentage,
          completedResourceSize: s.completedResourceSize,
        };
      } catch {
        return {
          id: p.id,
          name: (p.metadata?.name as string) ?? (p.metadata?.id as string),
          state: "error" as const,
          percentage: 0,
          completedResourceSize: 0,
        };
      }
    }),
  );

  return statusFromPacks(snapshots);
}

/**
 * Apaga os pacotes offline de Leiria (leiria-light e leiria-dark).
 */
export async function deleteOfflineMap(): Promise<void> {
  const allPacks: OfflinePack[] = await OfflineManager.getPacks();
  const leiriaPacks = allPacks.filter((p) => {
    const name = (p.metadata?.name as string) ?? (p.metadata?.id as string);
    return name === OFFLINE_PACK_LIGHT || name === OFFLINE_PACK_DARK;
  });

  for (const pack of leiriaPacks) {
    try {
      await OfflineManager.deletePack(pack.id);
    } catch {
      // Ignora erro se o pacote já não existir mais
    }
  }
}

/**
 * Inicia o download dos pacotes offline de Leiria para os estilos claro e escuro.
 * Regras:
 * - Define limite de tiles com folga sobre a região antes de baixar;
 * - Apaga pacote anterior com o mesmo id antes de baixar de novo;
 * - Cria um pacote para leiria-light e um para leiria-dark;
 * - Mesma caixa geográfica e zoom 10 a 14;
 * - Notifica progresso combinado via onProgress.
 */
export async function startOfflineMapDownload(
  region: OfflineRegion,
  onProgress?: OfflineProgressCallback,
): Promise<void> {
  // Define o limite de tiles com folga sobre o tileCount estimado da região
  const tileLimit = Math.max(1000, region.tileCount * 3);
  OfflineManager.setTileCountLimit(tileLimit);

  // Nunca cria segundo pacote com o mesmo id: apaga os antigos antes
  await deleteOfflineMap();

  const bounds: [number, number, number, number] = [
    region.bounds.west,
    region.bounds.south,
    region.bounds.east,
    region.bounds.north,
  ];

  const minZoom = DOMAIN_CONFIG.offlineMinZoom;
  const maxZoom = DOMAIN_CONFIG.offlineMaxTileZoom;

  let lightPercent = 0;
  let darkPercent = 0;

  const reportProgress = () => {
    if (!onProgress) return;
    const combined = combineProgress([lightPercent, darkPercent]);
    onProgress({ kind: "downloading", percent: combined });
  };

  const downloadStylePack = (
    name: string,
    styleUrl: string,
    onPackPercent: (pct: number) => void,
  ): Promise<OfflinePack> => {
    return new Promise<OfflinePack>((resolve, reject) => {
      let settled = false;
      OfflineManager.createPack(
        {
          mapStyle: styleUrl,
          bounds,
          minZoom,
          maxZoom,
          metadata: { name, id: name },
        },
        (_pack, status) => {
          onPackPercent(status.percentage);
          reportProgress();
          if (status.state === "complete") {
            if (!settled) {
              settled = true;
              resolve(_pack);
            }
          }
        },
        (_pack, err) => {
          if (!settled) {
            settled = true;
            reject(new Error(err.message));
          }
        },
      ).catch((err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
    });
  };

  try {
    onProgress?.({ kind: "downloading", percent: 0 });

    await Promise.all([
      downloadStylePack(OFFLINE_PACK_LIGHT, MAP_STYLE_LIGHT, (pct) => {
        lightPercent = pct;
      }),
      downloadStylePack(OFFLINE_PACK_DARK, MAP_STYLE_DARK, (pct) => {
        darkPercent = pct;
      }),
    ]);

    const finalStatus = await getOfflineMapStatus();
    onProgress?.(finalStatus);
  } catch (err) {
    onProgress?.({ kind: "error" });
    throw err;
  }
}
