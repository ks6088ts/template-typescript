import { describe, expect, it } from "vitest";
import { type VersionSettings, versionErrors } from "../scripts/check-versions.ts";

const settings: VersionSettings = {
  nodeVersion: "24.21.0",
  packageManager: "pnpm@12.11.2",
  nodeEngine: ">=24.21.0 <27",
  pnpmEngine: "12.11.2",
  nodeTypes: "24.19.2",
  dockerfile:
    "FROM node:24.21.0-trixie-slim AS builder\nRUN npm install --global pnpm@12.11.2\nFROM gcr.io/distroless/nodejs24-debian13:nonroot",
  devcontainer: '{"features":{"node":{"version": "24.21.0"}}}',
};

describe("version consistency", () => {
  it("accepts the shared toolchain", () => {
    expect(versionErrors(settings)).toEqual([]);
  });

  it.each([
    ["nodeVersion", "24"],
    ["packageManager", "pnpm@latest"],
    ["pnpmEngine", "10.12.4"],
    ["nodeEngine", ">=22"],
    ["nodeTypes", "26.0.0"],
    ["dockerfile", "FROM node:22.17.0-alpine"],
    ["devcontainer", '{"version": "22"}'],
  ] as const)("rejects drift in %s", (key, value) => {
    expect(versionErrors({ ...settings, [key]: value }).length).toBeGreaterThan(0);
  });

  it("rejects a mismatched runtime even with the correct builder", () => {
    expect(
      versionErrors({
        ...settings,
        dockerfile: settings.dockerfile.replace("nodejs24-", "nodejs22-"),
      }),
    ).toContain("Docker runtime must match the Node major");
  });

  it("rejects a mismatched Docker package manager", () => {
    expect(
      versionErrors({
        ...settings,
        dockerfile: settings.dockerfile.replace("pnpm@12.11.2", "pnpm@10.12.4"),
      }),
    ).toContain("Docker pnpm must match packageManager");
  });
});
