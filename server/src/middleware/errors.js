export function notFound(req, res) {
  res.status(404).json({ error: "Route not found" });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  console.error(error);
  const status = error.statusCode ?? 500;
  res.status(status).json({ error: error.message ?? "Internal server error" });
}
