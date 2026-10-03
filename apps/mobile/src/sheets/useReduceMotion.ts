import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** "Reduzir movimento" do iOS (4.5 §2.5): acompanha o ajuste, inclusive se mudar com o app aberto. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => alive && setReduce(value));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
