export class DrStoneError extends Error {}

export class FetchError extends DrStoneError {
  constructor(
    message: string,
    readonly options: {
      code?: string;
      retriable?: boolean;
      statusCode?: number;
      url?: string;
      finalUrl?: string;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
  }

  get code(): string {
    return this.options.code ?? "fetch_error";
  }

  get retriable(): boolean {
    return this.options.retriable ?? false;
  }

  get statusCode(): number | undefined {
    return this.options.statusCode;
  }

  get url(): string | undefined {
    return this.options.url;
  }

  get finalUrl(): string | undefined {
    return this.options.finalUrl;
  }

  get details(): Record<string, unknown> {
    return this.options.details ?? {};
  }
}

export class ParseError extends DrStoneError {
  constructor(
    message: string,
    readonly options: {
      code?: string;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
  }

  get code(): string {
    return this.options.code ?? "parse_error";
  }

  get details(): Record<string, unknown> {
    return this.options.details ?? {};
  }
}
