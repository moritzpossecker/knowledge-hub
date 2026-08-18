import type { Config } from "@knowledge-hub/core";
import { defaultConfig as sharedDefaultConfig } from "@knowledge-hub/core";

export const defaultConfig: Config = structuredClone(sharedDefaultConfig);
