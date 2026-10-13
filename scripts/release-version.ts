import { readFileSync } from "node:fs";

interface Version {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: string[];
  build: string | undefined;
}

const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseVersion(value: string): Version {
  const match = semver.exec(value);
  if (!match || match[0] !== value) {
    throw new Error(`Invalid SemVer: ${value}`);
  }
  return {
    major: BigInt(match[1] ?? ""),
    minor: BigInt(match[2] ?? ""),
    patch: BigInt(match[3] ?? ""),
    prerelease: match[4]?.split(".") ?? [],
    build: match[5],
  };
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (const field of ["major", "minor", "patch"] as const) {
    if (a[field] !== b[field]) {
      return a[field] > b[field] ? 1 : -1;
    }
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return Number(b.prerelease.length > 0) - Number(a.prerelease.length > 0);
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const first = a.prerelease[index];
    const second = b.prerelease[index];
    if (first === second) continue;
    if (first === undefined) return -1;
    if (second === undefined) return 1;
    const firstNumeric = /^\d+$/.test(first);
    const secondNumeric = /^\d+$/.test(second);
    if (firstNumeric && secondNumeric) {
      return BigInt(first) > BigInt(second) ? 1 : -1;
    }
    if (firstNumeric !== secondNumeric) return firstNumeric ? -1 : 1;
    return first > second ? 1 : -1;
  }
  return 0;
}

export function prepareRelease(version: string, existingTags: readonly string[]) {
  const parsed = parseVersion(version);
  if (parsed.build || version.length > 127) {
    throw new Error("Release versions must fit a container tag and omit build metadata");
  }
  const tag = `v${version}`;
  if (existingTags.includes(tag)) {
    throw new Error(`Tag already exists: ${tag}`);
  }
  const stableVersions = existingTags.flatMap((existingTag) => {
    if (!existingTag.startsWith("v")) return [];
    const candidate = existingTag.slice(1);
    try {
      return parseVersion(candidate).prerelease.length === 0 ? [candidate] : [];
    } catch {
      return [];
    }
  });
  if (stableVersions.some((stable) => compareVersions(version, stable) <= 0)) {
    throw new Error("The release version must be newer than every existing stable version");
  }
  return {
    version,
    tag,
    prerelease: parsed.prerelease.length > 0,
    publishLatest: parsed.prerelease.length === 0,
  };
}

if (import.meta.main) {
  try {
    const release = prepareRelease(process.argv[2] ?? "", readFileSync(0, "utf8").split(/\r?\n/));
    for (const [key, value] of Object.entries(release)) {
      process.stdout.write(`${key}=${String(value)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
