"""Custom exception classes."""


class PEMException(Exception):
    """Base exception for PEM application."""

    pass


class NotFoundError(PEMException):
    """Resource not found error."""

    pass


class ValidationError(PEMException):
    """Validation error."""

    pass


class UnauthorizedError(PEMException):
    """Unauthorized access error."""

    pass


class ConflictError(PEMException):
    """Resource conflict error (e.g., duplicate entry)."""

    pass
