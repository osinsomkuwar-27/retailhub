const { ApiError } = require('../utils/http');

/**
 * validate({ body?, query?, params? }) — Zod schemas.
 * Parsed (coerced + defaulted) values replace the originals.
 */
const validate = (schemas) => (req, _res, next) => {
  const errors = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ field: [part, ...issue.path].join('.'), message: issue.message });
      }
    } else if (part === 'query') {
      // Express 5: req.query is a read-only getter that re-parses the URL on every
      // access, so replace it on this request with the validated, type-converted values.
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true, enumerable: true });
    } else {
      req[part] = result.data;
    }
  }
  if (errors.length) return next(ApiError.badRequest('Validation failed', errors));
  return next();
};

module.exports = { validate };
