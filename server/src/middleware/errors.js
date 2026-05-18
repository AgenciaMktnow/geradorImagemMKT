export function notFound(req, res) {
  res.status(404).json({ error: "Route not found" });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  console.error(error);
  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Cada imagem deve ter no máximo 5 MB" });
  }
  const status = error.statusCode ?? 500;
  res.status(status).json({ error: error.message ?? "Internal server error" });
}
