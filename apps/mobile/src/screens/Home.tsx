/**
 * TL-01 Início sem mapa (E-02 §4.4; 4.1 §11, "sem tiles"): fundo neutro e a folha inicial.
 * Sem nenhum ponto no banco ("Começar do zero"): o Início vazio da 4.5 §8.5 (`EmptyHome`).
 */
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View } from "react-native";
import { type RootParamList, getScreenEntry, navigationRef } from "../nav/screenEntries";
import { presentationOf } from "../nav/screenPresentation";
import { TelaScreen } from "../nav/TelaScreen";
import { usePlaces } from "../data/PlacesProvider";
import { useStopIndex } from "../data/StopIndexProvider";
import { SheetHost } from "../sheets/SheetHost";
import { SheetsProvider } from "../sheets/SheetsContext";
import { useTheme } from "../theme";
import { ToastHost } from "../ui/ToastHost";
import { RecordsButton } from "./RecordsButton";
import { SettingsButton } from "./SettingsButton";
import { EmptyHome } from "./EmptyHome";
import { MapBackdrop } from "./MapBackdrop";

const Stack = createNativeStackNavigator<RootParamList>();

// Componente de identidade estável: uma função inline na rota remontaria o Início a cada render do `Home`.
function Inicio() {
  const { colors } = useTheme();
  const stops = useStopIndex();
  const places = usePlaces();

  const isEmpty =
    stops.status === "ready" &&
    places.status === "ready" &&
    stops.stops.length === 0 &&
    places.shortcuts.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {!isEmpty ? <MapBackdrop /> : null}
      <RecordsButton />
      <SettingsButton />
      <SheetHost customBase={isEmpty ? <EmptyHome /> : undefined} />
    </View>
  );
}

export function Home() {
  const { colors } = useTheme();

  return (
    <SheetsProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator initialRouteName="inicio" screenOptions={{ headerShown: false, gestureEnabled: true }}>
            <Stack.Screen name="inicio" component={Inicio} />
            <Stack.Screen
              name="tela"
              component={TelaScreen}
              options={({ route }) => ({
                presentation: presentationOf(getScreenEntry(route.params.id)?.kind ?? "records") === "modal" ? "modal" : "card",
              })}
            />
          </Stack.Navigator>
        </NavigationContainer>
        {/* O toast fica por último: acima das folhas, sem entrar no layout delas. */}
        <ToastHost />
      </View>
    </SheetsProvider>
  );
}
