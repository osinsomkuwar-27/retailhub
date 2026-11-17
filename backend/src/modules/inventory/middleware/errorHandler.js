// Converts every error thrown in Module 1 routes into the shared error shape.
// Person 4's global handler can replace this; the output shape is identical.
const mongoose = require('mongoose');
const { ApiError } = require('../utils/http');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for ${err.path}`;
    errors = undefined;
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {}).join(', ');
    message = `Duplicate value for ${field || 'a unique field'}`;
    errors = undefined;
  } else if (err.code === 121) {
    // MongoDB $jsonSchema validator rejected the document
    status = 400;
    message = 'Document failed database schema validation';
    errors = undefined;
  } else if (!(err instanceof ApiError) && status === 500) {
    console.error('[error]', err);
    if (process.env.NODE_ENV === 'production') message = 'Internal server error';
    errors = undefined;
  }

  const body = { success: false, message };
  if (errors) body.errors = errors;
  res.status(status).json(body);
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };
