import { caveman } from "./caveman";
import { ponytail } from "./ponytail";
import type { Reader } from "./types";

export type { ModeReading, Reader, ReaderContext } from "./types";

/** One entry per mode-aware plugin. Add a reader here and in the README. */
export const readers: Reader[] = [caveman, ponytail];
