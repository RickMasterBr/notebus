/**
 * Posição inferior do toast (D-039; E-03 F4):
 * Se o teclado estiver aberto, fica 12 px acima dele; caso contrário, usa a margem da área segura inferior.
 */
export function toastBottom(keyboardHeight: number, insetsBottom: number): number {
  return keyboardHeight > 0 ? keyboardHeight + 12 : Math.max(insetsBottom - 6, 12);
}
