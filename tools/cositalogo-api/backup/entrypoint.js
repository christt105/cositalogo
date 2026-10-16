import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** True when the module at `moduleUrl` is the script node was started with, following symlinks. */
export function isEntrypoint(moduleUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
