import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { generatedDir } from "../storage/paths.js";

function svg({ title, subtitle, width = 1400, height = 1800, accent = "#0f766e" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="1" stop-color="#dbeafe"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="${width * 0.08}" y="${height * 0.08}" width="${width * 0.84}" height="${height * 0.84}" rx="24" fill="#ffffff" opacity="0.78"/>
  <circle cx="${width * 0.5}" cy="${height * 0.38}" r="${Math.min(width, height) * 0.18}" fill="${accent}" opacity="0.2"/>
  <rect x="${width * 0.37}" y="${height * 0.28}" width="${width * 0.26}" height="${height * 0.46}" rx="100" fill="${accent}" opacity="0.72"/>
  <rect x="${width * 0.25}" y="${height * 0.66}" width="${width * 0.5}" height="${height * 0.12}" rx="32" fill="#111827" opacity="0.82"/>
  <text x="50%" y="${height * 0.84}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${Math.max(24, width * 0.045)}" font-weight="700" fill="#111827">${escapeXml(title)}</text>
  <text x="50%" y="${height * 0.89}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${Math.max(16, width * 0.026)}" fill="#475569">${escapeXml(subtitle)}</text>
</svg>`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  })[char]);
}

async function writeSvg({ title, subtitle, width, height }) {
  const filename = `${uuid()}.svg`;
  const absolutePath = path.join(generatedDir, filename);
  await fs.writeFile(absolutePath, svg({ title, subtitle, width, height }), "utf8");
  return {
    storagePath: `generated/${filename}`,
    mimeType: "image/svg+xml",
    sizeBytes: Buffer.byteLength(await fs.readFile(absolutePath)),
    width,
    height
  };
}

export const mockProvider = {
  name: "mock",
  async generateBase({ prompt }) {
    return writeSvg({
      title: "Imagem principal mock",
      subtitle: prompt.slice(0, 90),
      width: 1400,
      height: 1800
    });
  },
  async generateUnfold({ prompt, preset }) {
    return writeSvg({
      title: preset.name,
      subtitle: prompt.slice(0, 90),
      width: preset.width,
      height: preset.height
    });
  }
};
