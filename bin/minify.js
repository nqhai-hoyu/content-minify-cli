#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { inspectContent, protectContent } from "../lib/protect-content.js";
import { verifyContent } from "../lib/verify-content.js";

function fail(message) {
  process.stderr.write(`minify: ${message}\n`);
  process.exitCode = 1;
}

function parseArguments(args) {
  const contentNames = [];
  let outputPath;
  let dryRun = false;
  let help = false;
  let obfuscate = false;
  let version = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--out") {
      outputPath = args[index + 1];
      if (!outputPath || outputPath.startsWith("-")) {
        throw new Error("--out requires a directory path");
      }
      index += 1;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--obfuscate") {
      obfuscate = true;
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument === "--version" || argument === "-v") {
      version = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else {
      contentNames.push(argument);
    }
  }

  return { contentNames, dryRun, help, obfuscate, outputPath, version };
}

function printHelp() {
  process.stdout.write(`Usage: minify <content-name...> [options]

Options:
  --obfuscate        Obfuscate JavaScript after minification
  --out <directory>  Choose output for a single content only
  --dry-run          Show the processing plan without creating output
  --help, -h         Show this help
  --version, -v      Show the installed version
`);
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

async function processContent({ contentName, cwd, dryRun, obfuscate, outputPath }) {
  const source = path.resolve(cwd, contentName);
  const output = outputPath
    ? path.resolve(cwd, outputPath)
    : path.resolve(cwd, "dist", path.basename(source));
  const checks = await loadVerificationChecks(cwd, path.basename(source));

  let sourceStat;
  try {
    sourceStat = await stat(source);
  } catch {
    throw new Error(`content directory not found: ${contentName}`);
  }

  if (!sourceStat.isDirectory()) {
    throw new Error(`content path is not a directory: ${contentName}`);
  }

  if (
    source === output ||
    output.startsWith(`${source}${path.sep}`) ||
    source.startsWith(`${output}${path.sep}`)
  ) {
    throw new Error(
      "output directory must be separate from and must not contain the source content",
    );
  }

  if (dryRun) {
    const summary = await inspectContent(source);
    process.stdout.write(
      `Dry run for ${contentName}\n` +
        `HTML: ${summary.htmlFiles}\n` +
        `CSS: ${summary.cssFiles}\n` +
        `JavaScript: ${summary.javascriptFiles}\n` +
        `Total files copied: ${summary.totalFiles}\n` +
        `Output: ${path.relative(cwd, output)}\n`,
    );
    return;
  }

  const distRoot = path.dirname(output);
  await mkdir(distRoot, { recursive: true });
  const staging = await mkdtemp(path.join(distRoot, `.${path.basename(source)}.stage-`));

  try {
    await cp(source, staging, { recursive: true, force: true });
    await protectContent(staging, { obfuscate });
    await verifyContent(staging, checks);

    await publish(staging, output);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }

  const resultLabel = obfuscate ? "Obfuscated" : "Minified";
  process.stdout.write(`${resultLabel} content created at ${path.relative(cwd, output)}\n`);
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }
  const { contentNames, dryRun, help, obfuscate, outputPath, version } = options;
  if (help) {
    printHelp();
    return;
  }
  if (version) {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }
  if (!contentNames.length) {
    fail("usage: minify <content-name...> [--out <directory>]");
    return;
  }
  if (outputPath && contentNames.length > 1) {
    fail("--out can only be used with one content directory");
    return;
  }
  const cwd = process.cwd();
  const outputKeys = contentNames.map((contentName) => {
    const source = path.resolve(cwd, contentName);
    const output = path.resolve(cwd, "dist", path.basename(source));
    return process.platform === "win32" ? output.toLowerCase() : output;
  });
  if (new Set(outputKeys).size !== outputKeys.length) {
    fail("multiple contents resolve to the same output directory");
    return;
  }

  for (const contentName of contentNames) {
    await processContent({ contentName, cwd, dryRun, obfuscate, outputPath });
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
