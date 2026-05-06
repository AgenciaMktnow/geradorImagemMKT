import { describe, expect, it } from "vitest";
import { buildBasePrompt, buildUnfoldPrompt } from "../src/utils/prompt.js";

describe("prompt builders", () => {
  it("builds a guided base prompt", () => {
    const prompt = buildBasePrompt({
      scenario: "studio clean",
      style: "premium editorial",
      pose: "standing",
      extraInstructions: "highlight the jacket",
      negativePrompt: "distorted hands"
    });

    expect(prompt).toContain("studio clean");
    expect(prompt).toContain("premium editorial");
    expect(prompt).toContain("Avoid: distorted subject");
    expect(prompt).toContain("Do not render any text");
    expect(prompt).not.toContain("model identity");
  });

  it("sanitizes sensitive body and identity terms before sending prompts to Gemini", () => {
    const prompt = buildBasePrompt({
      scenario: "",
      style: "",
      pose: "Modelo em pé",
      extraInstructions: "preserve face and skin",
      negativePrompt: "Mãos distorcidas, produto deformado"
    });

    expect(prompt).toContain("referencia em pé");
    expect(prompt).toContain("preserve subject and subject");
    expect(prompt).toContain("referencia distorcidas");
    expect(prompt).not.toContain("Modelo");
    expect(prompt).not.toContain("face");
    expect(prompt).not.toContain("skin");
    expect(prompt).not.toContain("Mãos");
  });

  it("defaults to faithful edit mode when no creative direction is provided", () => {
    const prompt = buildBasePrompt({
      scenario: "",
      style: "",
      pose: "",
      extraInstructions: "",
      negativePrompt: ""
    });

    expect(prompt).toContain("main visual reference");
    expect(prompt).toContain("Keep the original composition");
    expect(prompt).toContain("Only modify the image where needed");
    expect(prompt).toContain("replace that existing accessory");
    expect(prompt).not.toContain("skin texture");
    expect(prompt).not.toContain("neck/chest");
  });

  it("builds an unfold prompt with dimensions", () => {
    const prompt = buildUnfoldPrompt("base brief", {
      name: "Instagram story",
      slug: "instagram-story",
      width: 1080,
      height: 1920,
      channel: "instagram"
    });

    expect(prompt).toContain("1080x1920");
    expect(prompt).toContain("Instagram story");
    expect(prompt).toContain("base brief");
    expect(prompt).toContain("designer can later add copy");
    expect(prompt).toContain("no graphic design overlays");
  });

  it("adds safe area guidance for Instagram campaign stories", () => {
    const prompt = buildUnfoldPrompt("base brief", {
      name: "Story Instagram Campanha",
      slug: "instagram-story-campaign",
      width: 1080,
      height: 1920,
      channel: "instagram"
    });

    expect(prompt).toContain("top 250px and bottom 350px");
    expect(prompt).toContain("extend naturally through those safe areas");
    expect(prompt).toContain("between y=250px and y=1570px");
  });
});
