export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err && err.code === "ERR_MODULE_NOT_FOUND" && (specifier.startsWith("./") || specifier.startsWith("../"))) {
      try {
        return await nextResolve(specifier + ".ts", context);
      } catch {
        // continua para relançar o erro original
      }
    }
    throw err;
  }
}
