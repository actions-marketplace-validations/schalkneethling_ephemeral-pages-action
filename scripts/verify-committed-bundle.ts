#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import {
  BUNDLE_FILES,
  NCC_PACKAGE,
  nccOnlyBundleDriftAllowed,
  parsePnpmImporterVersions,
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

function nccVersion(manifest: PackageManifest, lockfile: string): string | undefined {
  return (
    parsePnpmImporterVersions(lockfile, "devDependencies")[NCC_PACKAGE] ??
    manifest.devDependencies?.[NCC_PACKAGE]
  );
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

const baseLockfile = gitShow(base, "pnpm-lock.yaml");
const headLockfile = gitShow("HEAD", "pnpm-lock.yaml");
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
    baseProductionVersions: parsePnpmImporterVersions(baseLockfile, "dependencies"),
    headProductionVersions: parsePnpmImporterVersions(headLockfile, "dependencies"),
    baseNccVersion: nccVersion(basePackage, baseLockfile),
    headNccVersion: nccVersion(headPackage, headLockfile),
  })
) {
  console.log(
    "Allowing dist drift for an ncc-only upgrade. pnpm release:check still requires a rebuilt bundle.",
  );
  process.exit(0);
}

throw new Error("Committed bundle differs from the rebuilt output.");
