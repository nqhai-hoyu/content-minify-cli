import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import CleanCSS from "clean-css";
import { minify as minifyHtml } from "html-minifier-terser";
import JavaScriptObfuscator from "javascript-obfuscator";
import { minify as minifyJavaScript } from "terser";

const SCRIPT_TAG = /<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>\s*<\/script\s*>/gi;

function isLocalApplicationScript(src) {
  const pathname = src.split(/[?#]/, 1)[0];
  return (
    pathname.toLowerCase().endsWith(".js") &&
    !pathname.toLowerCase().endsWith(".min.js") &&
    !/^(?:[a-z]+:)?\/\//i.test(pathname)
  );
}

function resolveInside(root, relativePath) {
  const resolved = path.resolve(root, relativePath.replaceAll("/", path.sep));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`asset path escapes content directory: ${relativePath}`);
  }
  return resolved;
}

async function protectJavaScript(outputRoot, html) {
  const matches = [...html.matchAll(SCRIPT_TAG)].filter((match) =>
    isLocalApplicationScript(match[2]),
  );

  if (matches.length === 0) return html;

  const processedPaths = new Set();
  for (const match of matches) {
    const relativePath = match[2].split(/[?#]/, 1)[0];
    const sourcePath = resolveInside(outputRoot, relativePath);
    if (processedPaths.has(sourcePath)) continue;
    processedPaths.add(sourcePath);

    const source = await readFile(sourcePath, "utf8");
    const minified = await minifyJavaScript(source, {
      compress: { passes: 2 },
      ecma: 2015,
      mangle: { toplevel: false },
      safari10: true,
      toplevel: false,
    });
    if (!minified.code) throw new Error(`JavaScript minifier produced no output: ${relativePath}`);

    const protectedCode = JavaScriptObfuscator.obfuscate(minified.code, {
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      debugProtection: false,
      disableConsoleOutput: false,
      identifierNamesGenerator: "hexadecimal",
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 8,
      stringArray: true,
      stringArrayEncoding: ["base64"],
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayThreshold: 0.8,
      transformObjectKeys: true,
    }).getObfuscatedCode();
    await writeFile(sourcePath, protectedCode);
  }

  return html;
}

async function protectCssDirectory(outputRoot) {
  const cssRoot = path.join(outputRoot, "css");
  let entries;
  try {
    entries = await import("node:fs/promises").then(({ readdir }) =>
      readdir(cssRoot, { recursive: true, withFileTypes: true }),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".css")) continue;
    if (entry.name.toLowerCase().endsWith(".min.css")) continue;
    const filePath = path.join(entry.parentPath, entry.name);
    const source = await readFile(filePath, "utf8");
    const result = new CleanCSS({ level: 2 }).minify(source);
    if (result.errors.length) throw new Error(result.errors.join("; "));
    await writeFile(filePath, result.styles);
  }
}

export async function protectContent(outputRoot) {
  const htmlPath = path.join(outputRoot, "index.html");
  let html = await readFile(htmlPath, "utf8");
  html = await protectJavaScript(outputRoot, html);
  await protectCssDirectory(outputRoot);
  html = await minifyHtml(html, {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    decodeEntities: true,
    keepClosingSlash: true,
    minifyCSS: true,
    minifyJS: false,
    removeComments: true,
    removeRedundantAttributes: false,
  });
  await writeFile(htmlPath, html);
}
