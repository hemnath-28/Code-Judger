
// Controller passes Error to this services
// It passes error to App.js global error middleware.js

export function apiError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}
