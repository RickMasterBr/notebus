import { StackedSheet } from "./StackedSheet";

export function OverrideSheet({ id }: { id: number }) {
  return <StackedSheet id={id}>{null}</StackedSheet>;
}
