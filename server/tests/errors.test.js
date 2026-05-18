import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errors.js";

describe("error handler", () => {
  it("returns a useful 413 message when an uploaded image exceeds the file limit", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const json = vi.fn();
    const res = {
      headersSent: false,
      status: vi.fn(() => res),
      json
    };

    errorHandler({ code: "LIMIT_FILE_SIZE" }, {}, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({ error: "Cada imagem deve ter no máximo 5 MB" });
    consoleError.mockRestore();
  });
});
