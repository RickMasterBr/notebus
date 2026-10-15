/** Ponto de entrada do executável mvp-report. */
import { register } from "node:module";

register("./resolver.js", import.meta.url);

const { main } = await import("./cli.ts");
const code = await main(process.argv.slice(2));
process.exit(code);
