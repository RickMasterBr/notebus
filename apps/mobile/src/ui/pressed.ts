export const PRESSED_OPACITY = 0.7;

/** Feedback de toque dos botões: some só quando o botão está ativo. */
export function pressedStyle(pressed: boolean, disabled?: boolean) {
  return pressed && !disabled ? { opacity: PRESSED_OPACITY } : null;
}
