import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  nccOnlyBundleDriftAllowed,
  parsePnpmImporterVersions,
  type BundleDriftInput,
  type PackageManifest,
} from "../scripts/lib/committed-bundle.js";

const lockfile = readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8");

const basePackage: PackageManifest = {
  dependencies: { "@actions/core": "^3.0.0", "@actions/github": "^9.0.0" },
  devDependencies: { "@vercel/ncc": "^0.44.1", oxlint: "^1.77.0", typescript: "^5.9.3" },
};

const nccOnlyPackage: PackageManifest = {
  dependencies: { "@actions/core": "^3.0.0", "@actions/github": "^9.0.0" },
  devDependencies: { "@vercel/ncc": "^0.45.0", oxlint: "^1.77.0", typescript: "^5.9.3" },
};

const productionVersions = {
  "@actions/core": "3.0.1",
  "@actions/github": "9.1.1",
};

function input(overrides: Partial<BundleDriftInput> = {}): BundleDriftInput {
  return {
    changedFiles: ["package.json", "pnpm-lock.yaml"],
    basePackage,
    headPackage: nccOnlyPackage,
    baseProductionVersions: productionVersions,
    headProductionVersions: productionVersions,
    baseNccVersion: "0.44.1",
    headNccVersion: "0.45.0",
    ...overrides,
  };
}

describe("committed bundle acceptance criteria", () => {
  it("allows dist drift when only ncc changed", () => {
    expect(nccOnlyBundleDriftAllowed(input())).toBe(true);
  });

  it("allows dist drift when ncc changes alongside non-bundle files", () => {
    expect(
      nccOnlyBundleDriftAllowed(
        input({ changedFiles: ["README.md", "package.json", "pnpm-lock.yaml"] }),
      ),
    ).toBe(true);
  });

  it("rejects dist drift when action source changed", () => {
    expect(
      nccOnlyBundleDriftAllowed(
        input({ changedFiles: ["src/run.ts", "package.json", "pnpm-lock.yaml"] }),
      ),
    ).toBe(false);
  });

  it("rejects dist drift when the action entry or TypeScript config changed", () => {
    expect(nccOnlyBundleDriftAllowed(input({ changedFiles: ["action.yml"] }))).toBe(false);
    expect(nccOnlyBundleDriftAllowed(input({ changedFiles: ["tsconfig.json"] }))).toBe(false);
  });

  it("rejects dist drift when a runtime dependency changed", () => {
    expect(
      nccOnlyBundleDriftAllowed(
        input({
          headPackage: {
            ...nccOnlyPackage,
            dependencies: { "@actions/core": "^3.1.0", "@actions/github": "^9.0.0" },
          },
        }),
      ),
    ).toBe(false);
  });

  it("rejects dist drift when a lockfile production version changed", () => {
    expect(
      nccOnlyBundleDriftAllowed(
        input({
          headProductionVersions: { ...productionVersions, "@actions/core": "3.1.0" },
        }),
      ),
    ).toBe(false);
  });

  it("rejects unexpected dist drift when ncc did not change", () => {
    expect(
      nccOnlyBundleDriftAllowed(
        input({
          headPackage: basePackage,
          baseNccVersion: "0.44.1",
          headNccVersion: "0.44.1",
        }),
      ),
    ).toBe(false);
  });

  it("rejects dist drift when another toolchain package changed with ncc", () => {
    expect(
      nccOnlyBundleDriftAllowed(
        input({
          headPackage: {
            ...nccOnlyPackage,
            devDependencies: { ...nccOnlyPackage.devDependencies, typescript: "^5.9.4" },
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("pnpm lockfile importer versions", () => {
  it("reads production and ncc versions from the committed lockfile", () => {
    expect(parsePnpmImporterVersions(lockfile, "dependencies")).toEqual({
      "@actions/core": "3.0.1",
      "@actions/github": "9.1.1",
    });
    expect(parsePnpmImporterVersions(lockfile, "devDependencies")["@vercel/ncc"]).toBe("0.44.1");
  });
});
