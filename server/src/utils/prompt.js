export function buildBasePrompt(prompt) {
  const scenario = sanitizePromptText(prompt.scenario);
  const style = sanitizePromptText(prompt.style);
  const pose = sanitizePromptText(prompt.pose);
  const extraInstructions = sanitizePromptText(prompt.extraInstructions);
  const negativePrompt = sanitizePromptText(prompt.negativePrompt);
  const hasCreativeDirection = Boolean(
    scenario || style || pose || extraInstructions
  );

  const parts = [
    hasCreativeDirection
      ? "Create a realistic commercial product campaign image using the uploaded reference images."
      : "Create a realistic commercial product image from the uploaded references. Use the first uploaded image as the main visual reference.",
    hasCreativeDirection ? "" : faithfulEditInstruction(),
    scenario ? `Scene change requested by user: ${scenario}.` : "",
    style ? `Visual style requested by user: ${style}.` : "",
    pose ? `Composition change requested by user: ${pose}.` : "",
    extraInstructions ? `Extra instructions: ${extraInstructions}.` : "",
    negativePrompt ? `Avoid: ${negativePrompt}.` : "",
    hasCreativeDirection
      ? "Keep the product details accurate and make the final image look like a polished brand campaign photograph."
      : "Accurately incorporate the uploaded product reference images into the main visual so the result looks natural and commercially usable.",
    hasCreativeDirection ? "" : accessoryReplacementInstruction(),
    noTextInstruction()
  ];
  return parts.filter(Boolean).join(" ");
}

function sanitizePromptText(value = "") {
  return String(value)
    .replace(/\b(model|identity|face|facial|skin|body|chest|neck|hands?|fingers?|ears?|earrings?)\b/gi, "subject")
    .replace(/\b(modelo|identidade|rosto|facial|pele|corpo|peito|pescoço|pescoco|mãos?|maos?|dedos?|orelhas?|brincos?)\b/gi, "referencia")
    .trim();
}

export function buildUnfoldPrompt(basePrompt, preset, extraInstructions = "") {
  const regenerationInstructions = sanitizePromptText(extraInstructions);
  if (basePrompt?.includes("BANNER_UNFOLD_MODE")) return buildBannerUnfoldPrompt(basePrompt, preset, regenerationInstructions);

  return [
    `Recompose the generated campaign image for ${preset.name}.`,
    `Target size: ${preset.width}x${preset.height}.`,
    `Channel: ${preset.channel}.`,
    safeAreaInstruction(preset),
    regenerationInstructions ? `Additional regeneration instructions from the user: ${regenerationInstructions}.` : "",
    "Preserve product visibility, natural proportions, lighting, and useful negative space for marketing layout.",
    "Leave clean negative space where a designer can later add copy in Photoshop or another design tool.",
    noTextInstruction(),
    `Original brief: ${basePrompt}`
  ].filter(Boolean).join(" ");
}

function buildBannerUnfoldPrompt(basePrompt, preset, regenerationInstructions = "") {
  return [
    `Adapt the provided finished banner into ${preset.name}.`,
    `Target size: ${preset.width}x${preset.height}.`,
    `Channel: ${preset.channel}.`,
    safeAreaInstruction(preset),
    regenerationInstructions ? `Additional regeneration instructions from the user: ${regenerationInstructions}.` : "",
    "Preserve the original campaign content, product/photo, text, typography hierarchy, logo, call-to-action, visual style, colors, and brand layout as much as possible.",
    "Recompose and resize the layout intelligently for the target aspect ratio without inventing unrelated content.",
    "Keep all existing text from the uploaded banner legible when possible. Do not add new slogans, new prices, new URLs, or new placeholder text.",
    `Original brief: ${basePrompt}`
  ].filter(Boolean).join(" ");
}

function safeAreaInstruction(preset) {
  if (preset.slug !== "instagram-story-campaign") return "";

  return [
    "Instagram campaign story safe areas: keep the top 250px and bottom 350px clear of all main content.",
    "The background, colors, texture, lighting, and image continuation must extend naturally through those safe areas.",
    "Do not place products, people, faces, logos, typography, captions, CTA elements, prices, or important visual details inside the top 250px or bottom 350px.",
    "Place the main campaign composition only between y=250px and y=1570px."
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
    "Keep the original composition, background, camera angle, framing, crop, lighting, and overall appearance close to the main reference image.",
    "Do not invent a room, do not add furniture, and do not add extra props beyond the uploaded product references.",
    "Only modify the image where needed to integrate the uploaded products realistically into the main reference image."
  ].join(" ");
}

function accessoryReplacementInstruction() {
  return [
    "If the uploaded product is a wearable accessory, integrate it as a single realistic replacement rather than duplicating it.",
    "If a similar accessory already appears in the main reference image, replace that existing accessory with the uploaded product and avoid showing both versions at once.",
    "Do not create duplicate products, extra accessories, jewelry stands, product props, or catalog-style arrangements unless the user explicitly asks for them.",
    "Match the original perspective, occlusion, shadows, scale, and lighting so the product integration looks physically natural."
  ].join(" ");
}
