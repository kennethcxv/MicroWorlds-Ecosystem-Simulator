/** Player prefs: °F default + the one temperature-display seam. */
import { beforeEach, describe, expect, it } from "vitest";
import { cToF, fmtTemp, fmtTempRange, localizeTempText, getPrefs, resetPrefsCache, setPrefs } from "../src/ui/prefs";

describe("prefs / temperature units", () => {
  beforeEach(() => resetPrefsCache());

  it("defaults to Fahrenheit (the game-wide default)", () => {
    expect(getPrefs().tempUnit).toBe("F");
  });

  it("cToF converts correctly", () => {
    expect(cToF(0)).toBe(32);
    expect(cToF(30)).toBeCloseTo(86);
  });

  it("fmtTemp formats in the requested unit", () => {
    expect(fmtTemp(30, 0, "F")).toBe("86°F");
    expect(fmtTemp(30.9, 1, "C")).toBe("30.9°C");
  });

  it("fmtTempRange renders husbandry bands", () => {
    expect(fmtTempRange(30, 34, "F")).toBe("86–93°F");
    expect(fmtTempRange(30, 34, "C")).toBe("30–34°C");
  });

  it("localizeTempText converts °C inside prose (ranges + singles)", () => {
    const s = "Aim for a 30–34°C basking zone with a 21–25°C cool retreat; never above 36°C.";
    const f = localizeTempText(s, "F");
    expect(f).toContain("86–93°F");
    expect(f).toContain("70–77°F");
    expect(f).toContain("97°F");
    expect(f).not.toContain("°C");
    // °C mode leaves the text untouched.
    expect(localizeTempText(s, "C")).toBe(s);
  });

  it("setPrefs clamps volume and persists shape", () => {
    const p = setPrefs({ volume: 2 });
    expect(p.volume).toBe(1);
    expect(setPrefs({ volume: -1 }).volume).toBe(0);
  });
});
