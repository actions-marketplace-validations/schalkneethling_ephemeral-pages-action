#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import {
  BUNDLE_FILES,
  nccOnlyBundleDriftAllowed,
  parsePnpmRootImporters,
  type PackageManifest,
} from "./lib/committed-bundle.ts";
import { run } from "./lib/io.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

function gitShow(ref: string, file: string): string {
  return run("git", ["show", `${ref}:${file}`], { cwd: root, quiet: true });
}

function readManifest(ref: string): PackageManifest {
  return JSON.parse(gitShow(ref, "package.json")) as PackageManifest;
}

const diff = run("git", ["diff", "--", ...BUNDLE_FILES], { cwd: root, quiet: true });
if (!diff) {
  console.log("Committed bundle matches the rebuilt output.");
  process.exit(0);
}

const base = process.env.BUNDLE_CHECK_BASE?.trim() ?? "";
if (!base || /^0+$/.test(base)) {
  throw new Error("Committed bundle differs from the rebuilt output.");
}

const basePackage = readManifest(base);
const headPackage = readManifest("HEAD");
const changedFiles = run("git", ["diff", "--name-only", base, "HEAD"], {
  cwd: root,
  quiet: true,
})
  .split("\n")
  .filter(Boolean);

if (
  nccOnlyBundleDriftAllowed({
    changedFiles,
    basePackage,
    headPackage,
    baseImporterVersions: parsePnpmRootImporters(gitShow(base, "pnpm-lock.yaml")),
    headImporterVersions: parsePnpmRootImporters(gitShow("HEAD", "pnpm-lock.yaml")),
  })
) {
  console.log(
    "Allowing dist drift for an ncc-only upgrade. pnpm release:check still requires a rebuilt bundle.",
  );
  process.exit(0);
}

throw new Error("Committed bundle differs from the rebuilt output.");
