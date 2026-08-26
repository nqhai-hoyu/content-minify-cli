import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import CleanCSS from "clean-css";
import { minify as minifyHtml } from "html-minifier-terser";
import JavaScriptObfuscator from "javascript-obfuscator";
import { minify as minifyJavaScript } from "terser";

const INLINE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

async function listFiles(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function classifyFiles(files) {
  return {
    javascriptFiles: files.filter((filePath) => {
      const name = filePath.toLowerCase();
      return name.endsWith(".js") && !name.endsWith(".min.js");
    }),
    cssFiles: files.filter((filePath) => {
      const name = filePath.toLowerCase();
      return name.endsWith(".css") && !name.endsWith(".min.css");
    }),
    htmlFiles: files.filter((filePath) => filePath.toLowerCase().endsWith(".html")),
  };
}

export async function inspectContent(root) {
  const files = await listFiles(root);
  const { javascriptFiles, cssFiles, htmlFiles } = classifyFiles(files);
  return {
    totalFiles: files.length,
    htmlFiles: htmlFiles.length,
    cssFiles: cssFiles.length,
    javascriptFiles: javascriptFiles.length,
  };
}

async function protectJavaScriptSource(source, { module = false } = {}) {
  const minified = await minifyJavaScript(source, {
    compress: { passes: 2 },
    ecma: 2015,
    mangle: { toplevel: false },
    module,
    safari10: true,
    toplevel: false,
  });
  if (!minified.code) {
    throw new Error("JavaScript minifier produced no output");
  }

  return JavaScriptObfuscator.obfuscate(minified.code, {
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
}

async function protectJavaScriptFile(filePath) {
  const source = await readFile(filePath, "utf8");
  let protectedCode;
  try {
    protectedCode = await protectJavaScriptSource(source);
  } catch (error) {
    throw new Error(`${error.message}: ${filePath}`);
  }
  await writeFile(filePath, protectedCode);
}

async function protectCssFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const result = new CleanCSS({ level: 2 }).minify(source);
  if (result.errors.length) throw new Error(result.errors.join("; "));
  await writeFile(filePath, result.styles);
}

async function protectHtmlFile(filePath) {
  const source = await readFile(filePath, "utf8");
  let htmlWithProtectedScripts = "";
  let cursor = 0;
  for (const match of source.matchAll(INLINE_SCRIPT)) {
    htmlWithProtectedScripts += source.slice(cursor, match.index);
    const attributes = match[1];
    const code = match[2];
    const hasSource = /\bsrc\s*=/i.test(attributes);
    const typeMatch = attributes.match(/\btype\s*=\s*(["'])(.*?)\1/i);
    const type = typeMatch?.[2]?.trim().toLowerCase() ?? "";
    const isJavaScript =
      !type ||
      type === "module" ||
      type === "text/javascript" ||
      type === "application/javascript";

    if (hasSource || !isJavaScript || !code.trim()) {
      htmlWithProtectedScripts += match[0];
    } else {
      const protectedCode = await protectJavaScriptSource(code, {
        module: type === "module",
      });
      htmlWithProtectedScripts += `<script${attributes}>${protectedCode}</script>`;
    }
    cursor = match.index + match[0].length;
  }
  htmlWithProtectedScripts += source.slice(cursor);

  const protectedHtml = await minifyHtml(htmlWithProtectedScripts, {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    decodeEntities: true,
    keepClosingSlash: true,
    minifyCSS: true,
    minifyJS: false,
    removeComments: true,
    removeRedundantAttributes: false,
  });
  await writeFile(filePath, protectedHtml);
}

export async function protectContent(outputRoot) {
  const files = await listFiles(outputRoot);
  const { javascriptFiles, cssFiles, htmlFiles } = classifyFiles(files);

  for (const filePath of javascriptFiles) await protectJavaScriptFile(filePath);
  for (const filePath of cssFiles) await protectCssFile(filePath);
  for (const filePath of htmlFiles) await protectHtmlFile(filePath);
}
