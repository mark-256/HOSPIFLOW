export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, code = 'BAD_REQUEST') {
    super(400, code, message)
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(401, code, message)
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(403, code, message)
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(404, code, message)
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, code = 'CONFLICT') {
    super(409, code, message)
  }
}

export class ValidationError extends HttpError {
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(400, code, message)
  }
}
