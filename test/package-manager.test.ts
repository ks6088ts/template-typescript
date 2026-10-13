import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  packageManager: string;
  scripts: { preinstall: string };
};

describe("offline package-manager enforcement", () => {
  it.each([
    [`${pkg.packageManager.replace("@", "/")} npm/? node/v24.21.0`, 0],
    ["pnpm/10.12.4 npm/? node/v24.21.0", 1],
    ["npm/11.0.0 node/v24.21.0", 1],
    ["", 1],
  ])("checks the local user agent %s", (userAgent, status) => {
    expect(pkg.scripts.preinstall).toMatch(/^node -e ".*"$/);
    const expression = pkg.scripts.preinstall.slice('node -e "'.length, -1);
    const result = spawnSync(process.execPath, ["-e", expression], {
      env: { ...process.env, npm_config_user_agent: userAgent },
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status).toBe(status);
    expect(result.stderr).toBe(status === 0 ? "" : `Use ${pkg.packageManager}\n`);
  });
});
