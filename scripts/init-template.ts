import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function initializeContent(content: string, owner: string, repo: string): string {
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(owner)) {
    throw new Error("Invalid GitHub owner");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(repo) || repo === "." || repo === "..") {
    throw new Error("Invalid repository name");
  }
  return content
    .replaceAll("ks6088ts/template-typescript", `${owner}/${repo}`)
    .replaceAll("@ks6088ts", `@${owner}`)
    .replaceAll('"name": "template-typescript"', `"name": "${repo.toLowerCase()}"`)
    .replaceAll('"author": "ks6088ts"', `"author": "${owner}"`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [owner, repo] = process.argv.slice(2);
  if (!owner || !repo || process.argv.length !== 4) {
    process.stderr.write("Usage: node scripts/init-template.ts OWNER REPO\n");
    process.exitCode = 1;
  } else {
    const root = fileURLToPath(new URL("../", import.meta.url));
    for (const path of [
      "README.md",
      "package.json",
      ".github/CODEOWNERS",
      ".github/ISSUE_TEMPLATE/config.yml",
    ]) {
      const target = resolve(root, path);
      writeFileSync(target, initializeContent(readFileSync(target, "utf8"), owner, repo));
    }
    process.stdout.write("Repository references initialized; review the diff before committing.\n");
  }
}
