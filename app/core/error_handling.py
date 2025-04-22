"""
Error handling and custom exceptions for the Sushi POS system.

This module provides centralized error handling and custom exceptions
for the application. It includes:
- Custom exception classes
- Error response models
- Error codes
- Global exception handlers
"""

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging

# Configure logging
logger = logging.getLogger(__name__)

class ErrorCodes:
    """
    Error codes for the application.
    
    This class defines standard error codes used throughout the application
    for consistent error reporting and handling.
    """
    # Database errors
    DATABASE_ERROR = "DB_ERROR"
    RECORD_NOT_FOUND = "RECORD_NOT_FOUND"
    DUPLICATE_RECORD = "DUPLICATE_RECORD"
    
    # Authentication errors
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS"
    
    # Business logic errors
    INVALID_STATUS_TRANSITION = "INVALID_STATUS_TRANSITION"
    INVALID_OPERATION = "INVALID_OPERATION"
    RESOURCE_NOT_AVAILABLE = "RESOURCE_NOT_AVAILABLE"
    
    # Validation errors
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_INPUT = "INVALID_INPUT"
    
    # External service errors
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"

class ErrorResponse(BaseModel):
    """
    Standard error response model.
    
    This model defines the structure of error responses returned by the API.
    It includes:
    - Error code
    - Error message
    - Optional details
    """
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None

class CustomException(HTTPException):
    """
    Base class for custom exceptions.
    
    This class extends FastAPI's HTTPException to include additional
    error information and standardized error handling.
    """
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize a custom exception.
        
        Args:
            status_code (int): HTTP status code
            code (str): Error code from ErrorCodes
            message (str): Error message
            details (Optional[Dict[str, Any]]): Additional error details
        """
        super().__init__(status_code=status_code)
        self.code = code
        self.message = message
        self.details = details

class DatabaseError(CustomException):
    """Exception raised for database-related errors."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            status_code=500,
            code=ErrorCodes.DATABASE_ERROR,
            message=message,
            details=details
        )

class RecordNotFoundError(CustomException):
    """Exception raised when a requested record is not found."""
    def __init__(self, resource: str, resource_id: Any):
        super().__init__(
            status_code=404,
            code=ErrorCodes.RECORD_NOT_FOUND,
            message=f"{resource} with ID {resource_id} not found"
        )

class ValidationError(CustomException):
    """Exception raised for validation errors."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            status_code=400,
            code=ErrorCodes.VALIDATION_ERROR,
            message=message,
            details=details
        )

class AuthenticationError(CustomException):
    """Exception raised for authentication errors."""
    def __init__(self, message: str):
        super().__init__(
            status_code=401,
            code=ErrorCodes.INVALID_CREDENTIALS,
            message=message
        )

class AuthorizationError(CustomException):
    """Exception raised for authorization errors."""
    def __init__(self, message: str):
        super().__init__(
            status_code=403,
            code=ErrorCodes.INSUFFICIENT_PERMISSIONS,
            message=message
        )

async def custom_exception_handler(request: Request, exc: CustomException):
    """
    Global exception handler for custom exceptions.
    
    This handler formats custom exceptions into standardized error responses
    and logs the error details.
    
    Args:
        request (Request): The request that caused the exception
        exc (CustomException): The custom exception that was raised
        
    Returns:
        JSONResponse: Formatted error response
    """
    error_response = ErrorResponse(
        code=exc.code,
        message=exc.message,
        details=exc.details
    )
    
    # Log the error
    logger.error(
        f"Error: {exc.code} - {exc.message}",
        extra={
            "path": request.url.path,
            "method": request.method,
            "details": exc.details
        }
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response.model_dump()
    )

async def validation_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler for validation errors.
    
    This handler formats validation errors into standardized error responses
    and logs the error details.
    
    Args:
        request (Request): The request that caused the exception
        exc (Exception): The validation exception that was raised
        
    Returns:
        JSONResponse: Formatted error response
    """
    error_response = ErrorResponse(
        code=ErrorCodes.VALIDATION_ERROR,
        message=str(exc),
        details={"errors": exc.errors() if hasattr(exc, "errors") else None}
    )
    
    # Log the error
    logger.error(
        f"Validation Error: {str(exc)}",
        extra={
            "path": request.url.path,
            "method": request.method,
            "details": error_response.details
        }
    )
    
    return JSONResponse(
        status_code=400,
        content=error_response.model_dump()
    ) 