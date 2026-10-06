/**
 * TL-01 Início sem mapa (E-02 §4.4; 4.1 §11, "sem tiles"): fundo neutro e a folha inicial.
 * Sem nenhum ponto no banco ("Começar do zero"): o Início vazio da 4.5 §8.5 (`EmptyHome`).
 */
import { View } from "react-native";
import { usePlaces } from "../data/PlacesProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { SheetHost } from "../sheets/SheetHost";
import { SheetsProvider } from "../sheets/SheetsContext";
import { useTheme } from "../theme";
import { ToastHost } from "../ui/ToastHost";
import { SettingsButton } from "./SettingsButton";
import { EmptyHome } from "./EmptyHome";

export function Home() {
  const { colors } = useTheme();
  const stops = useStopIndex();
  const places = usePlaces();

  const isEmpty =
    stops.status === "ready" &&
    places.status === "ready" &&
    stops.stops.length === 0 &&
    places.shortcuts.length === 0;

  return (
    <SheetsProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SettingsButton />
        <SheetHost customBase={isEmpty ? <EmptyHome /> : undefined} />
        {/* O toast fica por último: acima das folhas, sem entrar no layout delas. */}
        <ToastHost />
      </View>
    </SheetsProvider>
  );
}
