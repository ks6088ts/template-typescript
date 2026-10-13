import { describe, expect, it } from "vitest";
import { compareVersions, parseVersion, prepareRelease } from "../scripts/release-version.ts";

describe("release version policy", () => {
  it.each([
    "",
    "v1.2.3",
    "1.2",
    "01.2.3",
    "1.02.3",
    "1.2.03",
    "1.2.3-01",
    "1.2.3-a..b",
    "1.2.3\n",
    "1.2.3;echo unsafe",
  ])("rejects invalid version %j", (version) => {
    expect(() => parseVersion(version)).toThrow("Invalid SemVer");
  });

  it("implements the SemVer prerelease ordering including numeric identifiers", () => {
    const sequence = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ];
    for (let index = 1; index < sequence.length; index++) {
      expect(compareVersions(sequence[index - 1] ?? "", sequence[index] ?? "")).toBe(-1);
      expect(compareVersions(sequence[index] ?? "", sequence[index - 1] ?? "")).toBe(1);
    }
    expect(compareVersions("1.0.0+first", "1.0.0+second")).toBe(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("99999999999999999999.0.0", "99999999999999999998.9.9")).toBe(1);
  });

  it("publishes latest only for a new stable version", () => {
    expect(prepareRelease("2.0.0", ["v1.9.9", "v2.0.0-rc.1", "not-a-version"])).toEqual({
      version: "2.0.0",
      tag: "v2.0.0",
      prerelease: false,
      publishLatest: true,
    });
  });

  it("keeps prerelease identifiers exact and never publishes latest", () => {
    expect(prepareRelease("2.0.0-rc.2", ["v1.9.9", "v2.0.0-rc.1"])).toEqual({
      version: "2.0.0-rc.2",
      tag: "v2.0.0-rc.2",
      prerelease: true,
      publishLatest: false,
    });
  });

  it.each(["1.0.0", "0.9.9", "1.0.0-rc.1"])(
    "rejects %s at or below the newest stable tag",
    (version) => {
      expect(() => prepareRelease(version, ["v0.1.0", "v1.0.0+source"])).toThrow("newer");
    },
  );

  it("rejects an existing prerelease tag and container-incompatible metadata", () => {
    expect(() => prepareRelease("2.0.0-rc.1", ["v2.0.0-rc.1"])).toThrow("already exists");
    expect(() => prepareRelease("2.0.0+build.1", [])).toThrow("omit build metadata");
    expect(() => prepareRelease(`1.0.0-${"a".repeat(128)}`, [])).toThrow("container tag");
  });
});
