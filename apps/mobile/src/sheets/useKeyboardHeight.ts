import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/** Altura do teclado aberto (0 se fechado). Serve para a lista rolável não ficar escondida atrás dele. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
