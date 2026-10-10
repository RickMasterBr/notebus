/**
 * Guarda puro para evitar submissões concorrentes (duplo clique/toque).
 */
export function createSubmitGuard() {
  let running = false;
  return {
    get isRunning() {
      return running;
    },
    run: async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (running) return undefined;
      running = true;
      try {
        return await fn();
      } finally {
        running = false;
      }
    },
  };
}

export type SubmitGuard = ReturnType<typeof createSubmitGuard>;
