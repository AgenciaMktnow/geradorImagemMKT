import multer from "multer";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { uploadsDir } from "./paths.js";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_UPLOAD_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".img";
      cb(null, `${uuid()}${ext}`);
    }
  }),
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE_BYTES,
    files: 6
  },
  fileFilter: (req, file, cb) => {
    if (!allowedTypes.has(file.mimetype)) return cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
    cb(null, true);
  }
});
