// DIAG: tela de erro e manipulador global (E-09 bloco 18). Só age com `DIAG_SCROLL`; build normal fica como era.
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { DIAG_SCROLL, recordDiagEvent } from "./diagScroll";
import { formatDiagError, type DiagErrorInfo } from "./diagError";

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = { getGlobalHandler(): GlobalHandler; setGlobalHandler(handler: GlobalHandler): void };

let originalHandler: GlobalHandler | null = null;

/** Registra o erro na faixa de diagnóstico. */
function recordDiagError(info: DiagErrorInfo) {
  recordDiagEvent(`ERRO ${info.message}`);
  info.stackLines.slice(0, 5).forEach((line) => recordDiagEvent(`ERRO ${line}`));
}

/** Erros fora da renderização (efeitos, temporizadores, promessas). Guarda o original e o repassa sem diag. */
export function installDiagGlobalHandler() {
  if (!DIAG_SCROLL) return;
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils || originalHandler) return;
  originalHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (!DIAG_SCROLL) return originalHandler?.(error, isFatal);
    recordDiagError(formatDiagError(error));
  });
}

type State = { info: DiagErrorInfo | null };

class DiagErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { info: null };

  static getDerivedStateFromError(error: unknown): State {
    return { info: formatDiagError(error) };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const info = formatDiagError(error, errorInfo.componentStack);
    this.setState({ info });
    recordDiagError(info);
  }

  render() {
    const { info } = this.state;
    if (!info) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: "#111" }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
          <Text selectable style={{ color: "#fff", fontSize: 14 }}>
            {["ERRO", info.message, "", ...info.stackLines, "", ...info.componentLines].join("\n")}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

/** Envolve a raiz só com diag; sem diag devolve o próprio componente. */
export function withDiagErrorBoundary<P extends object>(Root: ComponentType<P>): ComponentType<P> {
  if (!DIAG_SCROLL) return Root;
  return function RootWithDiagBoundary(props: P) {
    return (
      <DiagErrorBoundary>
        <Root {...props} />
      </DiagErrorBoundary>
    );
  };
}
