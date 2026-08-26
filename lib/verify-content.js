import { createServer } from "node:http";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const WINDOWS_BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

async function findBrowser() {
  const candidates = [process.env.MINIFY_BROWSER_PATH, ...WINDOWS_BROWSERS].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported browser location.
    }
  }
  throw new Error(
    "Chrome or Edge was not found; set MINIFY_BROWSER_PATH to enable verification",
  );
}

function safeAssetPath(root, requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const resolved = path.resolve(root, relativePath.replaceAll("/", path.sep));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

async function startServer(root) {
  const server = createServer(async (request, response) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const filePath = safeAssetPath(root, request.url ?? "/");
    if (!filePath) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) ??
          "application/octet-stream",
      });
      response.end(body);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function listHtmlPages(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"),
    )
    .sort((left, right) => {
      if (left === "index.html") return -1;
      if (right === "index.html") return 1;
      return left.localeCompare(right);
    });
}

function pageUrl(origin, relativePath) {
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  return `${origin}/${encodedPath}`;
}

async function runInteractionCheck(page, check, index) {
  if (!check || typeof check !== "object") {
    throw new Error(`verification check ${index + 1} must be an object`);
  }
  const locator = check.selector ? page.locator(check.selector).first() : null;

  switch (check.action) {
    case "wait": {
      const milliseconds = Number(check.milliseconds);
      if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 30_000) {
        throw new Error("wait milliseconds must be between 0 and 30000");
      }
      await page.waitForTimeout(milliseconds);
      break;
    }
    case "click":
      await locator.click({ timeout: 5_000 });
      break;
    case "expectText": {
      const actual = (await locator.textContent({ timeout: 5_000 }))?.trim() ?? "";
      if (actual !== String(check.equals)) {
        throw new Error(
          `expected text ${JSON.stringify(check.equals)} at ${check.selector}, received ${JSON.stringify(actual)}`,
        );
      }
      break;
    }
    case "drag": {
      const box = await locator.boundingBox({ timeout: 5_000 });
      if (!box) throw new Error(`cannot drag hidden element: ${check.selector}`);
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + Number(check.dx ?? 0), startY + Number(check.dy ?? 0), {
        steps: 5,
      });
      await page.mouse.up();
      break;
    }
    case "expectAttribute": {
      const actual = await locator.getAttribute(check.name, { timeout: 5_000 });
      if ("equals" in check && actual !== String(check.equals)) {
        throw new Error(
          `expected attribute ${check.name}=${JSON.stringify(check.equals)} at ${check.selector}, received ${JSON.stringify(actual)}`,
        );
      }
      if ("notEquals" in check && actual === String(check.notEquals)) {
        throw new Error(
          `expected attribute ${check.name} at ${check.selector} to change from ${JSON.stringify(check.notEquals)}`,
        );
      }
      break;
    }
    default:
      throw new Error(`unsupported verification action: ${check.action}`);
  }
  await page.waitForTimeout(100);
}

export async function verifyContent(outputRoot, checks = []) {
  const executablePath = await findBrowser();
  const pages = await listHtmlPages(outputRoot);
  if (!pages.length) throw new Error("no HTML pages found for browser verification");
  const { server, origin } = await startServer(outputRoot);
  let browser;
  const errors = [];

  try {
    browser = await chromium.launch({ executablePath, headless: true });
    for (const relativePage of pages) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") pageErrors.push(message.text());
      });
      page.on("requestfailed", (request) => {
        pageErrors.push(
          `asset failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
        );
      });
      page.on("response", (response) => {
        if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) {
          pageErrors.push(`asset returned HTTP ${response.status()}: ${response.url()}`);
        }
      });

      await page.goto(pageUrl(origin, relativePage), {
        waitUntil: "load",
        timeout: 20_000,
      });
      await page.waitForTimeout(300);
      const pageChecks = checks.filter((check) => {
        const configuredPage = check?.page?.replaceAll("\\", "/") ?? "index.html";
        return configuredPage === relativePage;
      });
      for (const [index, check] of pageChecks.entries()) {
        await runInteractionCheck(page, check, index);
      }
      if (pageErrors.length) {
        errors.push(`${relativePage}: ${pageErrors.join("; ")}`);
      }
      await page.close();
    }
    if (errors.length) throw new Error(`browser verification failed: ${errors.join("; ")}`);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
