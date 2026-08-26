#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { protectContent } from "../lib/protect-content.js";
import { verifyContent } from "../lib/verify-content.js";

function fail(message) {
  process.stderr.write(`minify: ${message}\n`);
  process.exitCode = 1;
}

async function loadVerificationChecks(cwd, contentName) {
  try {
    const config = JSON.parse(
      await readFile(path.join(cwd, "minify.verify.json"), "utf8"),
    );
    const checks = config[contentName] ?? [];
    if (!Array.isArray(checks)) {
      throw new Error(`verification config for ${contentName} must be an array`);
    }
    return checks;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function listTree(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.map((entry) => ({
    isDirectory: entry.isDirectory(),
    relativePath: path.relative(root, path.join(entry.parentPath, entry.name)),
  }));
}

async function syncDirectory(source, target) {
  await mkdir(target, { recursive: true });
  const sourceEntries = await listTree(source);
  const sourcePaths = new Set(sourceEntries.map((entry) => entry.relativePath));

  for (const entry of sourceEntries.filter((item) => item.isDirectory)) {
    await mkdir(path.join(target, entry.relativePath), { recursive: true });
  }
  for (const entry of sourceEntries.filter((item) => !item.isDirectory)) {
    await cp(path.join(source, entry.relativePath), path.join(target, entry.relativePath), {
      force: true,
    });
  }

  const targetEntries = await listTree(target);
  const extras = targetEntries
    .filter((entry) => !sourcePaths.has(entry.relativePath))
    .sort((left, right) => right.relativePath.length - left.relativePath.length);
  for (const entry of extras) {
    await rm(path.join(target, entry.relativePath), {
      force: true,
      recursive: entry.isDirectory,
    });
  }
}

async function publish(staging, output) {
  const backup = `${output}.backup-${randomUUID()}`;
  let movedPreviousOutput = false;

  try {
    await rename(output, backup);
    movedPreviousOutput = true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      await rename(staging, output);
      return;
    }
    if (error?.code !== "EPERM" && error?.code !== "EACCES") throw error;

    await cp(output, backup, { recursive: true, force: true });
    try {
      await syncDirectory(staging, output);
      await rm(staging, { recursive: true, force: true });
      await rm(backup, { recursive: true, force: true });
      return;
    } catch (publishError) {
      try {
        await syncDirectory(backup, output);
        await rm(backup, { recursive: true, force: true });
      } catch {
        throw new Error(
          `${publishError.message}; rollback copy remains at ${backup}`,
        );
      }
      throw publishError;
    }
  }

  try {
    await rename(staging, output);
  } catch (error) {
    if (movedPreviousOutput) await rename(backup, output);
    throw error;
  }
  if (movedPreviousOutput) await rm(backup, { recursive: true, force: true });
}

async function main() {
  const contentName = process.argv[2];
  if (!contentName || contentName.startsWith("-")) {
    fail("usage: minify <content-name>");
    return;
  }

  const cwd = process.cwd();
  const source = path.resolve(cwd, contentName);
  const output = path.resolve(cwd, "dist", path.basename(source));
  const checks = await loadVerificationChecks(cwd, path.basename(source));

  let sourceStat;
  try {
    sourceStat = await stat(source);
  } catch {
    fail(`content directory not found: ${contentName}`);
    return;
  }

  if (!sourceStat.isDirectory()) {
    fail(`content path is not a directory: ${contentName}`);
    return;
  }

  if (source === output || output.startsWith(`${source}${path.sep}`)) {
    fail("output directory must be outside the source content");
    return;
  }

  const distRoot = path.dirname(output);
  await mkdir(distRoot, { recursive: true });
  const staging = await mkdtemp(path.join(distRoot, `.${path.basename(source)}.stage-`));

  try {
    await cp(source, staging, { recursive: true, force: true });
    await protectContent(staging);
    await verifyContent(staging, checks);

    await publish(staging, output);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }

  process.stdout.write(`Protected content created at ${path.relative(cwd, output)}\n`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
