import process from "node:process";

import { loadScrapperSettings } from "@dr-stone/scrapper";

export interface ApiSettings {
  host: string;
  port: number;
  scrapper: ReturnType<typeof loadScrapperSettings>;
}

export function loadApiSettings(): ApiSettings {
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? "8080"),
    scrapper: loadScrapperSettings()
  };
}
