import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { formatServiceMinute } from "@notebus/domain";

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>NoteBus · 1440 = {formatServiceMinute(1440)}</Text>
      <StatusBar style="auto" />
    </View>
  );
}
