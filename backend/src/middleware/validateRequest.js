export function validateRequest(schema) {
  // 
  return (req, _res, next) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    if (!result.success) {
      const error = new Error('Invalid request payload');
      error.status = 400;
      error.details = result.error.flatten();
      next(error);
      return;
    }

    req.validated = result.data;
    next();
  };
}
