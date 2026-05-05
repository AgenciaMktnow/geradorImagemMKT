export function buildBasePrompt(prompt) {
  const hasCreativeDirection = Boolean(
    prompt.scenario || prompt.style || prompt.pose || prompt.extraInstructions
  );

  const parts = [
    hasCreativeDirection
      ? "Create a realistic fashion/product campaign image using the provided model photo and product reference images."
      : "Edit the provided model photo with strict fidelity. Keep the original model image as the base image.",
    hasCreativeDirection ? "" : faithfulEditInstruction(),
    prompt.scenario ? `Scene change requested by user: ${prompt.scenario}.` : "",
    prompt.style ? `Visual style requested by user: ${prompt.style}.` : "",
    prompt.pose ? `Pose/composition change requested by user: ${prompt.pose}.` : "",
    prompt.extraInstructions ? `Extra instructions: ${prompt.extraInstructions}.` : "",
    prompt.negativePrompt ? `Avoid: ${prompt.negativePrompt}.` : "",
    hasCreativeDirection
      ? "Preserve the model identity and accurately incorporate the uploaded products."
      : "Accurately add the uploaded product reference images into the existing photo so they look naturally worn, held, placed, or integrated on the model.",
    hasCreativeDirection ? "" : accessoryReplacementInstruction(),
    noTextInstruction()
  ];
  return parts.filter(Boolean).join(" ");
}

export function buildUnfoldPrompt(basePrompt, preset) {
  if (basePrompt?.includes("BANNER_UNFOLD_MODE")) return buildBannerUnfoldPrompt(basePrompt, preset);

  return [
    `Recompose the generated campaign image for ${preset.name}.`,
    `Target size: ${preset.width}x${preset.height}.`,
    `Channel: ${preset.channel}.`,
    "Preserve product visibility, model identity, natural proportions, lighting, and useful negative space for marketing layout.",
    "Leave clean negative space where a designer can later add copy in Photoshop or another design tool.",
    noTextInstruction(),
    `Original brief: ${basePrompt}`
  ].join(" ");
}

function buildBannerUnfoldPrompt(basePrompt, preset) {
  return [
    `Adapt the provided finished banner into ${preset.name}.`,
    `Target size: ${preset.width}x${preset.height}.`,
    `Channel: ${preset.channel}.`,
    "Preserve the original campaign content, product, model/photo, text, typography hierarchy, logo, call-to-action, visual style, colors, and brand layout as much as possible.",
    "Recompose and resize the layout intelligently for the target aspect ratio without inventing unrelated content.",
    "Keep all existing text from the uploaded banner legible when possible. Do not add new slogans, new prices, new URLs, or new placeholder text.",
    `Original brief: ${basePrompt}`
  ].join(" ");
}

function noTextInstruction() {
  return [
    "Do not render any text in the image.",
    "Do not include typography, slogans, headlines, captions, labels, prices, watermarks, logos, buttons, badges, URLs, brand placeholders, or call-to-action elements.",
    "The final output must be a clean photographic visual only, with no graphic design overlays."
  ].join(" ");
}

function faithfulEditInstruction() {
  return [
    "Do not create a new scene.",
    "Do not change the background, camera angle, framing, crop, lighting, facial expression, pose, body position, clothing, skin texture, or identity of the model.",
    "Do not zoom out, do not invent a room, do not add furniture, do not add extra props beyond the uploaded product references.",
    "Only modify the image where needed to integrate the uploaded products realistically into the original model photo."
  ].join(" ");
}

function accessoryReplacementInstruction() {
  return [
    "If the uploaded product is jewelry or a wearable accessory, use replacement editing, not addition.",
    "If the original model photo already has earrings, replace the original earrings exactly at the ear positions with the uploaded earring product. Do not place earrings on fingers, hands, clothing, table, background, or anywhere else.",
    "If the original model photo already has a necklace or pendant, replace the original necklace or pendant exactly around the neck/chest position with the uploaded necklace product. Do not create extra necklaces or pendants.",
    "Remove or cover the original accessory being replaced so the old and new products are not both visible.",
    "Do not add hands, fingers, display poses, jewelry stands, product props, duplicate products, extra accessories, or catalog-style arrangements unless the user explicitly asks for them.",
    "Match the original perspective, occlusion, shadows, scale, skin contact, and lighting so the replacement looks physically worn in the same location."
  ].join(" ");
}
