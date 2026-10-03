import { useEffect, useRef, useState } from "react";

/** D-127: o esqueleto só aparece se a espera passar de 200 ms e, uma vez visível, fica no mínimo 400 ms. */
export const SKELETON_DELAY_MS = 200;
export const SKELETON_MIN_MS = 400;

/** `true` enquanto o esqueleto deve estar na tela. Quem usa mostra o conteúdo quando `loading` é falso **e** isto é falso. */
export function useSkeletonVisible(loading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        shownAt.current = performance.now();
        setVisible(true);
      }, SKELETON_DELAY_MS);
      return () => clearTimeout(timer);
    }
    // Terminou: se nunca apareceu, nada a fazer; se apareceu, espera completar o mínimo.
    if (shownAt.current === null) return;
    const rest = Math.max(0, SKELETON_MIN_MS - (performance.now() - shownAt.current));
    const timer = setTimeout(() => {
      shownAt.current = null;
      setVisible(false);
    }, rest);
    return () => clearTimeout(timer);
  }, [loading]);

  return visible;
}
