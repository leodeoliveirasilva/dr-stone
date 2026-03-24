export const SOURCE_FILTER_ALL = "all" as const;

const SOURCE_DEFINITIONS = [
  {
    sourceName: "kabum",
    sourceLabel: "KaBuM!"
  },
  {
    sourceName: "amazon",
    sourceLabel: "Amazon"
  },
  {
    sourceName: "pichau",
    sourceLabel: "Pichau"
  },
  {
    sourceName: "mercadolivre",
    sourceLabel: "Mercado Livre"
  }
] as const;

export type SourceName = (typeof SOURCE_DEFINITIONS)[number]["sourceName"];
export type SourceFilter = typeof SOURCE_FILTER_ALL | SourceName;

export interface SourceDefinition {
  sourceName: SourceName;
  sourceLabel: string;
}

export interface RegisteredSource extends SourceDefinition {
  active: boolean;
}

const SOURCE_DEFINITION_MAP = new Map<string, SourceDefinition>(
  SOURCE_DEFINITIONS.map((definition) => [definition.sourceName, definition])
);

export function listKnownSources(): SourceDefinition[] {
  return SOURCE_DEFINITIONS.map((definition) => ({ ...definition }));
}

export function listRegisteredSources(enabledSources: readonly string[]): RegisteredSource[] {
  const activeSources = new Set(normalizeConfiguredSourceNames(enabledSources));

  return SOURCE_DEFINITIONS.map((definition) => ({
    ...definition,
    active: activeSources.has(definition.sourceName)
  }));
}

export function normalizeConfiguredSourceNames(enabledSources: readonly string[]): SourceName[] {
  const normalized = enabledSources.map(normalizeSourceName).filter((value, index, values) => {
    return values.indexOf(value) === index;
  });

  normalized.forEach((sourceName) => {
    if (!SOURCE_DEFINITION_MAP.has(sourceName)) {
      throw new Error(`Unknown source: ${sourceName}`);
    }
  });

  return normalized as SourceName[];
}

export function parseSourceFilter(
  value: string | undefined,
  options: {
    defaultValue?: SourceFilter;
  } = {}
): SourceFilter {
  const rawValue = value?.trim().toLowerCase() ?? options.defaultValue ?? SOURCE_FILTER_ALL;
  if (rawValue === SOURCE_FILTER_ALL) {
    return SOURCE_FILTER_ALL;
  }

  return getSourceDefinition(rawValue).sourceName;
}

export function getSourceDefinition(sourceName: string): SourceDefinition {
  const normalizedSourceName = normalizeSourceName(sourceName);
  const definition = SOURCE_DEFINITION_MAP.get(normalizedSourceName);
  if (!definition) {
    throw new Error(`Unknown source: ${sourceName}`);
  }

  return definition;
}

function normalizeSourceName(sourceName: string): string {
  return sourceName.trim().toLowerCase();
}
