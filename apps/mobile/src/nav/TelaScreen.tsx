/** A rota `tela` do native stack: desenha a entrada pedida com o mesmo conteúdo da folha. */
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect } from "react";
import { StackedSheetContent } from "../sheets/SheetHost";
import { CloseSheetProvider } from "../sheets/StackedSheet";
import { ScreenContext } from "./ScreenContext";
import { type RootParamList, getScreenEntry } from "./screenEntries";

export function TelaScreen({ route, navigation }: NativeStackScreenProps<RootParamList, "tela">) {
  const entry = getScreenEntry(route.params.id);
  useEffect(() => {
    if (!entry && navigation.canGoBack()) navigation.goBack(); // o registro foi limpo
  }, [entry, navigation]);
  if (!entry) return null;
  return (
    <ScreenContext.Provider value={entry}>
      <CloseSheetProvider id={entry.id}>
        <StackedSheetContent entry={entry} />
      </CloseSheetProvider>
    </ScreenContext.Provider>
  );
}
