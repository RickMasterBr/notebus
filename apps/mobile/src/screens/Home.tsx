/** TL-01 Início sem mapa (E-02 §4.4; 4.1 §11, "sem tiles"): fundo neutro e a folha inicial. O conteúdo é do bloco 3b. */
import { View } from "react-native";
import { SheetHost } from "../sheets/SheetHost";
import { SheetsProvider } from "../sheets/SheetsContext";
import { useTheme } from "../theme";

export function Home() {
  const { colors } = useTheme();
  return (
    <SheetsProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SheetHost />
      </View>
    </SheetsProvider>
  );
}
