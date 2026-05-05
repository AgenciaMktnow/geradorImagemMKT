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
    expect(prompt).toContain("Avoid: distorted hands");
    expect(prompt).toContain("Do not render any text");
  });

  it("defaults to faithful edit mode when no creative direction is provided", () => {
    const prompt = buildBasePrompt({
      scenario: "",
      style: "",
      pose: "",
      extraInstructions: "",
      negativePrompt: ""
    });

    expect(prompt).toContain("strict fidelity");
    expect(prompt).toContain("Do not create a new scene");
    expect(prompt).toContain("Only modify the image where needed");
    expect(prompt).toContain("replace the original earrings exactly at the ear positions");
    expect(prompt).toContain("Do not add hands");
  });

  it("builds an unfold prompt with dimensions", () => {
    const prompt = buildUnfoldPrompt("base brief", {
      name: "Instagram story",
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
});
