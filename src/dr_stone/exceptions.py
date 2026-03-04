class DrStoneError(Exception):
    """Base exception for the project."""


class FetchError(DrStoneError):
    """Raised when a page cannot be fetched."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "fetch_error",
        retriable: bool = False,
        status_code: int | None = None,
        url: str | None = None,
        final_url: str | None = None,
        details: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retriable = retriable
        self.status_code = status_code
        self.url = url
        self.final_url = final_url
        self.details = details or {}


class ParseError(DrStoneError):
    """Raised when a page cannot be parsed into a normalized result."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "parse_error",
        details: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}
