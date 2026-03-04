class DrStoneError(Exception):
    """Base exception for the project."""


class FetchError(DrStoneError):
    """Raised when a page cannot be fetched."""


class ParseError(DrStoneError):
    """Raised when a page cannot be parsed into a normalized result."""
