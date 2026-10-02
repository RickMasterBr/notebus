import { join } from "node:path";
import { main } from "./cli.ts";

process.exit(main(join(import.meta.dirname, "..", "..", "..")));
