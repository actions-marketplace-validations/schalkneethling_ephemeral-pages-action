export const BUNDLE_FILES = [
  "dist/index.js",
  "dist/index.js.map",
  "dist/package.json",
  "dist/sourcemap-register.cjs",
] as const;

export const BUNDLE_SOURCE_PATHS = ["src/", "action.yml", "tsconfig.json"] as const;

export const NCC_PACKAGE = "@vercel/ncc";

export interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface BundleDriftInput {
  changedFiles: string[];
  basePackage: PackageManifest;
  headPackage: PackageManifest;
  baseProductionVersions: Record<string, string>;
  headProductionVersions: Record<string, string>;
  baseNccVersion: string | undefined;
  headNccVersion: string | undefined;
}

export function parsePnpmImporterVersions(
  lockfile: string,
  section: "dependencies" | "devDependencies",
): Record<string, string> {
  const lines = lockfile.split(/\r?\n/);
  let inImporters = false;
  let inRoot = false;
  let inSection = false;
  let currentName: string | undefined;
  const versions: Record<string, string> = {};

  for (const line of lines) {
    if (!inImporters) {
      if (line === "importers:") inImporters = true;
      continue;
    }

    if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t")) break;
    if (!inRoot) {
      if (line === "  .:") inRoot = true;
      continue;
    }

    if (/^  \S/.test(line)) break;

    if (/^    \S/.test(line)) {
      inSection = line === `    ${section}:`;
      currentName = undefined;
      continue;
    }

    if (!inSection) continue;

    const name = /^      (?:'([^']+)'|([^:]+)):$/.exec(line);
    if (name) {
      currentName = name[1] ?? name[2];
      continue;
    }

    const version = /^        version: (.+)$/.exec(line)?.[1];
    if (version && currentName) {
      versions[currentName] = version;
      currentName = undefined;
    }
  }

  return versions;
}

export function changesBundleSource(changedFiles: string[]): boolean {
  return changedFiles.some((file) =>
    BUNDLE_SOURCE_PATHS.some((prefix) =>
      prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix,
    ),
  );
}

function sameRecord(
  left: Record<string, string> = {},
  right: Record<string, string> = {},
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

function otherDevDependencies(manifest: PackageManifest): Record<string, string> {
  const rest: Record<string, string> = {};
  for (const [name, version] of Object.entries(manifest.devDependencies ?? {})) {
    if (name !== NCC_PACKAGE) rest[name] = version;
  }
  return rest;
}

export function nccOnlyBundleDriftAllowed(input: BundleDriftInput): boolean {
  if (changesBundleSource(input.changedFiles)) return false;
  if (!sameRecord(input.basePackage.dependencies, input.headPackage.dependencies)) return false;
  if (
    !sameRecord(otherDevDependencies(input.basePackage), otherDevDependencies(input.headPackage))
  ) {
    return false;
  }
  if (!sameRecord(input.baseProductionVersions, input.headProductionVersions)) return false;
  return input.baseNccVersion !== input.headNccVersion;
}
