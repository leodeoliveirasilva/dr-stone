import pino from "pino";

import type { LoggerLike } from "./types.js";

export function createLogger(level: string): LoggerLike {
  return pino({
    level,
    base: undefined
  });
}
