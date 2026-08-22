import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("native Keyframe muted audio transport", () => {
  it("drops microphone frames while muted in both Persona microphone paths", () => {
    const bundlePath = resolve("node_modules/@keyframelabs/elements/dist/index.js");
    const bundle = readFileSync(bundlePath, "utf8");
    const mutedSendGuard = /if \(!this\._isMuted\) \{\s*const \w+ = I\(\w+\.data\);\s*this\.agent\?\.sendAudio\(\w+\);\s*\}/g;

    expect(bundle.match(mutedSendGuard)).toHaveLength(2);
    expect(bundle).not.toContain("new Float32Array(e.data.length)");
  });
});
