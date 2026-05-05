const supportedRatios = [
  { ratio: "1:1", value: 1 },
  { ratio: "1:4", value: 1 / 4 },
  { ratio: "1:8", value: 1 / 8 },
  { ratio: "2:3", value: 2 / 3 },
  { ratio: "3:2", value: 3 / 2 },
  { ratio: "3:4", value: 3 / 4 },
  { ratio: "4:1", value: 4 },
  { ratio: "4:3", value: 4 / 3 },
  { ratio: "4:5", value: 4 / 5 },
  { ratio: "5:4", value: 5 / 4 },
  { ratio: "8:1", value: 8 },
  { ratio: "9:16", value: 9 / 16 },
  { ratio: "16:9", value: 16 / 9 },
  { ratio: "21:9", value: 21 / 9 }
];

export function closestAspectRatio(width, height) {
  const target = width / height;
  return supportedRatios.reduce((best, current) => {
    const bestDelta = Math.abs(best.value - target);
    const currentDelta = Math.abs(current.value - target);
    return currentDelta < bestDelta ? current : best;
  }).ratio;
}

export function imageSizeForPreset(width, height) {
  const longestEdge = Math.max(width, height);
  if (longestEdge > 2048) return "4K";
  if (longestEdge > 1024) return "2K";
  return "1K";
}

export function imageConfigForDimensions(width, height) {
  return {
    aspectRatio: closestAspectRatio(width, height),
    imageSize: imageSizeForPreset(width, height)
  };
}
