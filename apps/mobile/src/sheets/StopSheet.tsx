/**
 * PROVISÓRIA (E-02 bloco 3b): folha de ponto só com o nome e o handle, para provar o empilhar sobre a Busca.
 * O bloco 4 a substitui pela TL-02 (Ponto). Não evolua esta folha: troque-a.
 */
import { Text } from "react-native";
import { type, useTheme } from "../theme";
import { StackedSheet } from "./StackedSheet";

export function StopSheet({ id, name }: { id: number; name: string }) {
  const { colors } = useTheme();
  return (
    <StackedSheet id={id}>
      <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
        {name}
      </Text>
    </StackedSheet>
  );
}
