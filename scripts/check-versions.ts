import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface VersionSettings {
  nodeVersion: string;
  packageManager: string;
  nodeEngine: string;
  pnpmEngine: string;
  nodeTypes: string;
  dockerfile: string;
  devcontainer: string;
}

export function versionErrors(settings: VersionSettings): string[] {
  const errors: string[] = [];
  const major = settings.nodeVersion.split(".")[0];
  const pnpmVersion = settings.packageManager.match(/^pnpm@(\d+\.\d+\.\d+)$/)?.[1];
  if (!/^\d+\.\d+\.\d+$/.test(settings.nodeVersion)) {
    errors.push(".node-version must specify an exact release");
  }
  if (!pnpmVersion || settings.pnpmEngine !== pnpmVersion) {
    errors.push("packageManager and engines.pnpm must specify the same exact pnpm release");
  }
  if (!settings.nodeEngine.startsWith(`>=${settings.nodeVersion} `)) {
    errors.push("engines.node must use .node-version as its minimum");
  }
  if (settings.nodeTypes.split(".")[0] !== major) {
    errors.push("@types/node must match the runtime major");
  }
  if (!settings.dockerfile.includes(`node:${settings.nodeVersion}-`)) {
    errors.push("Docker builder must match .node-version");
  }
  if (pnpmVersion && !settings.dockerfile.includes(`pnpm@${pnpmVersion}`)) {
    errors.push("Docker pnpm must match packageManager");
  }
  if (
    settings.dockerfile.includes("distroless/nodejs") &&
    !settings.dockerfile.includes(`distroless/nodejs${major}-`)
  ) {
    errors.push("Docker runtime must match the Node major");
  }
  if (!settings.devcontainer.includes(`"version": "${settings.nodeVersion}"`)) {
    errors.push("Dev Container Node feature must match .node-version");
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const read = (path: string): string => readFileSync(resolve(root, path), "utf8");
  const pkg = JSON.parse(read("package.json")) as {
    packageManager: string;
    engines: { node: string; pnpm: string };
    devDependencies: { "@types/node": string };
  };
  const errors = versionErrors({
    nodeVersion: read(".node-version").trim(),
    packageManager: pkg.packageManager,
    nodeEngine: pkg.engines.node,
    pnpmEngine: pkg.engines.pnpm,
    nodeTypes: pkg.devDependencies["@types/node"],
    dockerfile: read("Dockerfile"),
    devcontainer: read(".devcontainer/devcontainer.json"),
  });
  if (errors.length) {
    process.stderr.write(`${errors.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("Toolchain versions are consistent.\n");
  }
}
