/**
 * Centralized Error Handling Middleware
 *
 * Provides consistent error responses across all API endpoints.
 * Handles different error types and provides helpful error messages.
 */

/**
 * Application Error class for custom errors
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // Distinguish from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication Error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization Error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/**
 * Rate Limit Error (429)
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * External Service Error (502)
 */
export class ExternalServiceError extends AppError {
  constructor(service = 'External service', details = null) {
    super(`${service} is currently unavailable`, 502, details);
    this.name = 'ExternalServiceError';
  }
}

/**
 * Format error response
 */
function formatErrorResponse(error, includeStack = false) {
  const response = {
    error: {
      message: error.message || 'An unexpected error occurred',
      type: error.name || 'Error',
      statusCode: error.statusCode || 500
    }
  };

  // Add details if available
  if (error.details) {
    response.error.details = error.details;
  }

  // Add stack trace in development
  if (includeStack && error.stack) {
    response.error.stack = error.stack.split('\n');
  }

  return response;
}

/**
 * Error handling middleware
 *
 * This should be the LAST middleware in the chain
 */
export function errorHandler(err, req, res, next) {
  // Log error for debugging
  if (err.statusCode >= 500 || !err.isOperational) {
    console.error('❌ Error:', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      user: req.user?.email
    });
  }

  // Determine if we should include stack traces
  const includeStack = process.env.NODE_ENV !== 'production';

  // Handle specific error types
  let statusCode = err.statusCode || 500;
  let response;

  // Joi validation errors
  if (err.name === 'ValidationError' && err.isJoi) {
    statusCode = 400;
    response = {
      error: {
        message: 'Validation failed',
        type: 'ValidationError',
        statusCode: 400,
        details: err.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type
        }))
      }
    };
  }
  // SQLite errors
  else if (err.code && err.code.startsWith('SQLITE_')) {
    statusCode = 500;
    response = {
      error: {
        message: 'Database error occurred',
        type: 'DatabaseError',
        statusCode: 500,
        code: err.code
      }
    };

    // Don't expose SQL details in production
    if (includeStack) {
      response.error.sql = err.message;
    }
  }
  // Express/Node errors
  else if (err.name === 'SyntaxError' && 'body' in err) {
    statusCode = 400;
    response = {
      error: {
        message: 'Invalid JSON in request body',
        type: 'SyntaxError',
        statusCode: 400
      }
    };
  }
  // Default error handling
  else {
    response = formatErrorResponse(err, includeStack);
  }

  // Send error response
  res.status(statusCode).json(response);
}

/**
 * 404 Not Found handler
 *
 * This should be placed BEFORE the error handler
 * but AFTER all routes
 */
export function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      type: 'NotFoundError',
      statusCode: 404
    }
  });
}

/**
 * Async error wrapper
 *
 * Wraps async route handlers to catch rejected promises
 *
 * Usage:
 *   app.get('/route', asyncHandler(async (req, res) => {
 *     // Your async code here
 *   }));
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError
};
