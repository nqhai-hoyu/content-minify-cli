import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cliPath = path.resolve("bin/minify.js");

async function createContentFixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), "content-minify-"));
  const content = path.join(workspace, "CONTENT_TEST");
  await mkdir(path.join(content, "js"), { recursive: true });
  await mkdir(path.join(content, "css"), { recursive: true });

  await writeFile(
    path.join(content, "index.html"),
    `<!doctype html>
    <html><head><link rel="stylesheet" href="css/app.css"></head>
    <body><button id="run">Run</button><output id="result"></output>
    <script src="js/app.js"></script></body></html>`,
  );
  await writeFile(
    path.join(content, "css", "app.css"),
    "/* visible style */\n#result { color: rgb(0, 128, 0); }\n",
  );
  await writeFile(
    path.join(content, "js", "app.js"),
    `// behavior that must remain available
    window.applicationSettings = { meaningfulBusinessRule: 20 };
    function calculateResult(firstValue, secondValue) {
      return window.applicationSettings.meaningfulBusinessRule + firstValue + secondValue;
    }
    document.querySelector("#run").addEventListener("click", function () {
      document.querySelector("#result").textContent = calculateResult(10, 12);
    });`,
  );

  return { workspace, content };
}

async function listRelativeFiles(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"),
    )
    .sort();
}

test("user can protect a content directory through the CLI", async () => {
  const { workspace, content } = await createContentFixture();
  const original = await readFile(path.join(content, "js", "app.js"), "utf8");

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dist[\\/]CONTENT_TEST/);
  assert.equal(
    await readFile(path.join(content, "js", "app.js"), "utf8"),
    original,
    "the source content must never be modified",
  );
  assert.match(
    await readFile(path.join(workspace, "dist", "CONTENT_TEST", "index.html"), "utf8"),
    /<button id="run">Run<\/button>/,
  );
});

test("protected content preserves every original file name and path", async () => {
  const { workspace, content } = await createContentFixture();

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    await listRelativeFiles(path.join(workspace, "dist", "CONTENT_TEST")),
    await listRelativeFiles(content),
  );
});

test("every HTML, CSS, and JavaScript file in the content is protected", async () => {
  const { workspace, content } = await createContentFixture();
  await mkdir(path.join(content, "pages"), { recursive: true });
  await mkdir(path.join(content, "scripts"), { recursive: true });
  await mkdir(path.join(content, "styles"), { recursive: true });
  await writeFile(
    path.join(content, "pages", "details.html"),
    `<!doctype html>
      <!-- internal details -->
      <html><body><h1>Details</h1></body></html>`,
  );
  await writeFile(
    path.join(content, "styles", "secondary.css"),
    "/* secondary style */\n.details { padding: 10px 20px; }\n",
  );
  await writeFile(
    path.join(content, "scripts", "secondary.js"),
    `// internal secondary behavior
      function secondaryFeature(readableParameter) {
        return readableParameter * 2;
      }
      window.secondaryFeature = secondaryFeature;`,
  );

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const output = path.join(workspace, "dist", "CONTENT_TEST");
  assert.doesNotMatch(
    await readFile(path.join(output, "pages", "details.html"), "utf8"),
    /internal details|\n\s+/,
  );
  assert.doesNotMatch(
    await readFile(path.join(output, "styles", "secondary.css"), "utf8"),
    /secondary style|\n/,
  );
  assert.doesNotMatch(
    await readFile(path.join(output, "scripts", "secondary.js"), "utf8"),
    /internal secondary behavior|readableParameter/,
  );
});

test("inline JavaScript is protected without changing its behavior", async () => {
  const { workspace, content } = await createContentFixture();
  await writeFile(
    path.join(content, "index.html"),
    `<!doctype html><html><body>
      <button id="run">Run</button><output id="result"></output>
      <script>
        (() => {
          function readableInlineFunction(readableInlineParameter) {
            return readableInlineParameter + 2;
          }
          document.querySelector("#run").addEventListener("click", function () {
            document.querySelector("#result").textContent = readableInlineFunction(40);
          });
        })();
      </script>
    </body></html>`,
  );
  await writeFile(
    path.join(workspace, "minify.verify.json"),
    JSON.stringify({
      CONTENT_TEST: [
        { action: "click", selector: "#run" },
        { action: "expectText", selector: "#result", equals: "42" },
      ],
    }),
  );

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(
    await readFile(path.join(workspace, "dist", "CONTENT_TEST", "index.html"), "utf8"),
    /readableInlineFunction|readableInlineParameter/,
  );
});

test("ES modules and root-relative script paths remain functional", async () => {
  const { workspace, content } = await createContentFixture();
  await mkdir(path.join(content, "modules"), { recursive: true });
  await writeFile(
    path.join(content, "index.html"),
    `<!doctype html><html><body>
      <button id="run">Run</button><output id="result"></output>
      <script type="module" src="/modules/app.js"></script>
    </body></html>`,
  );
  await writeFile(
    path.join(content, "modules", "math.js"),
    `export function readableModuleCalculation(readableModuleParameter) {
      return readableModuleParameter + 2;
    }`,
  );
  await writeFile(
    path.join(content, "modules", "app.js"),
    `import { readableModuleCalculation } from "./math.js";
    document.querySelector("#run").addEventListener("click", () => {
      document.querySelector("#result").textContent = readableModuleCalculation(40);
    });`,
  );
  await writeFile(
    path.join(workspace, "minify.verify.json"),
    JSON.stringify({
      CONTENT_TEST: [
        { action: "click", selector: "#run" },
        { action: "expectText", selector: "#result", equals: "42" },
      ],
    }),
  );

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(
    await readFile(
      path.join(workspace, "dist", "CONTENT_TEST", "modules", "math.js"),
      "utf8",
    ),
    /readableModuleParameter/,
  );
});

test("runtime errors on secondary HTML pages prevent publication", async () => {
  const { workspace, content } = await createContentFixture();
  await mkdir(path.join(content, "pages"), { recursive: true });
  await writeFile(
    path.join(content, "pages", "broken.html"),
    `<!doctype html><html><body><script>
      throw new Error("secondary runtime failed");
    </script></body></html>`,
  );
  const published = path.join(workspace, "dist", "CONTENT_TEST");
  await mkdir(published, { recursive: true });
  await writeFile(path.join(published, "index.html"), "previous-good-build");

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /secondary runtime failed/i);
  assert.equal(
    await readFile(path.join(published, "index.html"), "utf8"),
    "previous-good-build",
  );
});

test("user can choose a custom output directory", async () => {
  const { workspace } = await createContentFixture();

  const result = spawnSync(
    process.execPath,
    [cliPath, "CONTENT_TEST", "--out", "release/PROTECTED_CONTENT"],
    { cwd: workspace, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /release[\\/]PROTECTED_CONTENT/);
  assert.match(
    await readFile(
      path.join(workspace, "release", "PROTECTED_CONTENT", "index.html"),
      "utf8",
    ),
    /<button id="run">Run<\/button>/,
  );
  await assert.rejects(
    readFile(path.join(workspace, "dist", "CONTENT_TEST", "index.html"), "utf8"),
    { code: "ENOENT" },
  );
});

test("dry run reports the protection plan without creating output", async () => {
  const { workspace } = await createContentFixture();

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST", "--dry-run"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run/i);
  assert.match(result.stdout, /HTML:\s*1/i);
  assert.match(result.stdout, /CSS:\s*1/i);
  assert.match(result.stdout, /JavaScript:\s*1/i);
  await assert.rejects(readFile(path.join(workspace, "dist", "CONTENT_TEST", "index.html")), {
    code: "ENOENT",
  });
});

test("published content no longer exposes readable application source", async () => {
  const { workspace } = await createContentFixture();

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const outputRoot = path.join(workspace, "dist", "CONTENT_TEST");
  const html = await readFile(path.join(outputRoot, "index.html"), "utf8");
  const css = await readFile(path.join(outputRoot, "css", "app.css"), "utf8");
  const javascript = await readFile(
    path.join(outputRoot, "js", "app.js"),
    "utf8",
  );

  assert.doesNotMatch(html, /\n\s+/);
  assert.doesNotMatch(css, /visible style/);
  assert.doesNotMatch(javascript, /behavior that must remain available/);
  assert.doesNotMatch(
    javascript,
    /firstValue|secondValue|meaningfulBusinessRule/,
  );
  assert.match(html, /js\/app\.js/);
});

test("a failed protection run never replaces the last published content", async () => {
  const { workspace, content } = await createContentFixture();
  await writeFile(path.join(content, "js", "app.js"), "function broken( {");
  const published = path.join(workspace, "dist", "CONTENT_TEST");
  await mkdir(published, { recursive: true });
  await writeFile(path.join(published, "index.html"), "previous-good-build");

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.equal(
    await readFile(path.join(published, "index.html"), "utf8"),
    "previous-good-build",
  );
});

test("help describes the public CLI options", () => {
  const result = spawnSync(process.execPath, [cliPath, "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /minify <content-name>/i);
  assert.match(result.stdout, /--out/);
  assert.match(result.stdout, /--dry-run/);
});

test("version reports the installed package version", () => {
  const result = spawnSync(process.execPath, [cliPath, "--version"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "0.2.0");
});

test("configured checks can wait for asynchronous behavior", async () => {
  const { workspace, content } = await createContentFixture();
  await writeFile(
    path.join(content, "js", "app.js"),
    `document.querySelector("#run").addEventListener("click", () => {
      setTimeout(() => {
        document.querySelector("#result").textContent = "42";
      }, 300);
    });`,
  );
  await writeFile(
    path.join(workspace, "minify.verify.json"),
    JSON.stringify({
      CONTENT_TEST: [
        { action: "click", selector: "#run" },
        { action: "wait", milliseconds: 400 },
        { action: "expectText", selector: "#result", equals: "42" },
      ],
    }),
  );

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
});

test("runtime errors prevent protected content from being published", async () => {
  const { workspace, content } = await createContentFixture();
  await writeFile(
    path.join(content, "js", "app.js"),
    'throw new Error("runtime failed");',
  );
  const published = path.join(workspace, "dist", "CONTENT_TEST");
  await mkdir(published, { recursive: true });
  await writeFile(path.join(published, "index.html"), "previous-good-build");

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /runtime failed/i);
  assert.equal(
    await readFile(path.join(published, "index.html"), "utf8"),
    "previous-good-build",
  );
});

test("a failed configured interaction check prevents publication", async () => {
  const { workspace, content } = await createContentFixture();
  await writeFile(
    path.join(content, "js", "app.js"),
    `document.querySelector("#run").addEventListener("click", function () {
      document.querySelector("#result").textContent = "41";
    });`,
  );
  await writeFile(
    path.join(workspace, "minify.verify.json"),
    JSON.stringify({
      CONTENT_TEST: [
        { action: "click", selector: "#run" },
        { action: "expectText", selector: "#result", equals: "42" },
      ],
    }),
  );
  const published = path.join(workspace, "dist", "CONTENT_TEST");
  await mkdir(published, { recursive: true });
  await writeFile(path.join(published, "index.html"), "previous-good-build");

  const result = spawnSync(process.execPath, [cliPath, "CONTENT_TEST"], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected text.*42/i);
  assert.equal(
    await readFile(path.join(published, "index.html"), "utf8"),
    "previous-good-build",
  );
});
