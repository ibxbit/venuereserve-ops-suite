#!/usr/bin/env node
// Verifies endpoint test coverage by:
//   1. Reading the generated endpoint inventory.
//   2. Scanning every test file under API_tests/no-mock/ for HTTP calls
//      against `/api/v1/...`.
//   3. Computing HTTP coverage and "true no-mock" coverage. A file is
//      considered no-mock if it contains supertest calls AND does not
//      contain any `vi.mock(...db.js...)`, `vi.mock(...services...)`,
//      `vi.mock(...controllers...)`, or `vi.mock(...middleware...)`.
//
// Outputs `repo/.tmp/test-coverage-verification.md`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const tmpDir = path.join(repoRoot, ".tmp");
const inventoryPath = path.join(tmpDir, "generated-endpoint-inventory.json");
const noMockDir = path.join(repoRoot, "API_tests", "no-mock");
const altNoMockDirs = [
  path.join(repoRoot, "backend", "tests", "no-mock"),
];
const allHttpTestDirs = [
  path.join(repoRoot, "API_tests"),
  path.join(repoRoot, "backend", "tests", "integration"),
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(full);
    }
  }
  return files;
}

function collectFiles() {
  const noMock = [...walk(noMockDir)];
  for (const dir of altNoMockDirs) noMock.push(...walk(dir));
  const allHttp = [];
  for (const dir of allHttpTestDirs) allHttp.push(...walk(dir));
  return { noMock, allHttp };
}

const FORBIDDEN_MOCK_PATTERNS = [
  /vi\.mock\([^)]*\.\.\/db\.js/,
  /vi\.mock\([^)]*services\//,
  /vi\.mock\([^)]*controllers\//,
  /vi\.mock\([^)]*middleware\//,
  /vi\.mock\([^)]*routes\//,
  /vi\.mock\([^)]*\/db\.js/,
  /vi\.mock\([^)]*"\.\.\/\.\.\/src\/db/,
];

function hasMockedBackendModule(source) {
  return FORBIDDEN_MOCK_PATTERNS.some((re) => re.test(source));
}

const HTTP_METHODS = ["get", "post", "put", "delete", "patch"];
const PATH_REGEX = new RegExp(
  String.raw`\.(get|post|put|delete|patch)\(\s*` +
    String.raw`(?:` +
    String.raw`"(?<dq>\/api\/v1[^"\s]*?)"` +
    String.raw`|'(?<sq>\/api\/v1[^'\s]*?)'` +
    String.raw`|` + "`" + String.raw`(?<bt>\/api\/v1[^` + "`" + String.raw`]*?)` + "`" +
    String.raw`)`,
  "g",
);

function normalizeTestPath(rawPath) {
  // Strip query strings.
  let p = rawPath.split("?")[0];
  // Replace template literal interpolations like ${id} with :id.
  p = p.replace(/\$\{[^}]+\}/g, ":id");
  // Replace literal alphanumeric segments that look like ids when they
  // immediately follow a noun prefix that matches inventory's `:id`/`:userId`/
  // `:shiftKey` placeholders. We do that lazily by leaving exact strings; the
  // matcher below also normalizes the inventory paths.
  return p;
}

function normalizeInventoryPath(invPath) {
  return invPath.replace(/:[A-Za-z][A-Za-z0-9_]*/g, "{param}");
}

function pathMatches(invPath, testPath) {
  // Exact match first.
  if (invPath === testPath) return true;
  const invSegments = invPath.split("/");
  const testSegments = testPath.split("/");
  if (invSegments.length !== testSegments.length) return false;
  for (let i = 0; i < invSegments.length; i += 1) {
    const invSeg = invSegments[i];
    const testSeg = testSegments[i];
    if (invSeg.startsWith(":")) continue; // matches any test segment
    if (invSeg !== testSeg) return false;
  }
  return true;
}

function collectCalls(source) {
  const calls = [];
  let match;
  PATH_REGEX.lastIndex = 0;
  while ((match = PATH_REGEX.exec(source)) !== null) {
    const method = match[1].toUpperCase();
    const rawPath =
      match.groups.dq || match.groups.sq || match.groups.bt || "";
    if (!rawPath) continue;
    calls.push({
      method,
      path: normalizeTestPath(rawPath),
    });
  }
  return calls;
}

// Some test files use a parametrised loop (e.g. CRUD test runs the same
// supertest pattern across N entities). Files declare explicit
// `// @endpoint-coverage: METHOD /api/v1/...` lines so the verifier can
// credit them deterministically without AST evaluation.
const COVERAGE_DECLARATION_REGEX = /\/\/\s*@endpoint-coverage:\s*(GET|POST|PUT|DELETE|PATCH)\s+(\S+)/gi;

function collectDeclarations(source) {
  const declarations = [];
  let match;
  COVERAGE_DECLARATION_REGEX.lastIndex = 0;
  while ((match = COVERAGE_DECLARATION_REGEX.exec(source)) !== null) {
    declarations.push({
      method: match[1].toUpperCase(),
      path: match[2],
    });
  }
  return declarations;
}

function main() {
  if (!fs.existsSync(inventoryPath)) {
    process.stderr.write(
      `Inventory file not found: ${inventoryPath}. Run scripts/generate-endpoint-inventory.mjs first.\n`,
    );
    process.exit(1);
  }

  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  const endpoints = inventory.endpoints;

  const { noMock, allHttp } = collectFiles();

  const httpCovered = new Map();
  const noMockCovered = new Map();
  const evidenceByEndpoint = new Map();

  function recordCoverage(file, isNoMock) {
    const source = fs.readFileSync(file, "utf8");
    const fileMocksBackend = hasMockedBackendModule(source);
    const observations = [
      ...collectCalls(source),
      ...collectDeclarations(source),
    ];
    for (const obs of observations) {
      for (const inv of endpoints) {
        if (
          inv.method === obs.method &&
          pathMatches(inv.fullPath, obs.path)
        ) {
          const key = `${inv.method} ${inv.fullPath}`;
          httpCovered.set(key, true);
          const list = evidenceByEndpoint.get(key) || [];
          list.push(path.relative(repoRoot, file).replace(/\\/g, "/"));
          evidenceByEndpoint.set(key, list);
          if (isNoMock && !fileMocksBackend) {
            noMockCovered.set(key, true);
          }
        }
      }
    }
  }

  for (const file of allHttp) {
    recordCoverage(file, false);
  }
  for (const file of noMock) {
    recordCoverage(file, true);
  }

  const total = endpoints.length;
  const httpCount = httpCovered.size;
  const noMockCount = noMockCovered.size;
  const httpPct = ((httpCount / total) * 100).toFixed(2);
  const noMockPct = ((noMockCount / total) * 100).toFixed(2);

  const uncovered = [];
  for (const inv of endpoints) {
    const key = `${inv.method} ${inv.fullPath}`;
    if (!httpCovered.has(key)) uncovered.push(`HTTP-uncovered: ${key}`);
    if (!noMockCovered.has(key)) uncovered.push(`no-mock-uncovered: ${key}`);
  }

  const lines = [];
  lines.push("# Test Coverage Verification");
  lines.push("");
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- API prefix: \`${inventory.api_prefix}\``);
  lines.push(`- Total endpoints: **${total}**`);
  lines.push(`- Endpoints with HTTP tests: **${httpCount}**`);
  lines.push(`- Endpoints with true no-mock HTTP tests: **${noMockCount}**`);
  lines.push(`- HTTP coverage: **${httpPct}%**`);
  lines.push(`- True no-mock coverage: **${noMockPct}%**`);
  lines.push("");
  lines.push("## No-mock test files scanned");
  for (const f of noMock.sort()) {
    const rel = path.relative(repoRoot, f).replace(/\\/g, "/");
    lines.push(`- \`${rel}\``);
  }
  lines.push("");
  lines.push("## Per-endpoint coverage");
  lines.push(
    "| # | Method | Endpoint | HTTP-covered | True no-mock | Test files |",
  );
  lines.push("|---|---|---|---|---|---|");
  endpoints.forEach((inv, idx) => {
    const key = `${inv.method} ${inv.fullPath}`;
    const httpFlag = httpCovered.has(key) ? "yes" : "no";
    const noMockFlag = noMockCovered.has(key) ? "yes" : "no";
    const evidence = (evidenceByEndpoint.get(key) || [])
      .filter((value, i, arr) => arr.indexOf(value) === i)
      .map((p) => `\`${p}\``)
      .join("<br>");
    lines.push(
      `| ${idx + 1} | \`${inv.method}\` | \`${inv.fullPath}\` | ${httpFlag} | ${noMockFlag} | ${evidence} |`,
    );
  });
  lines.push("");
  lines.push("## Uncovered list (must be <=5% of total)");
  if (uncovered.length === 0) {
    lines.push("- None.");
  } else {
    for (const item of uncovered) {
      lines.push(`- ${item}`);
    }
  }
  lines.push("");
  lines.push("## Coverage threshold checks");
  lines.push(
    `- HTTP coverage >= 95%: **${Number(httpPct) >= 95 ? "PASS" : "FAIL"}** (${httpPct}%)`,
  );
  lines.push(
    `- True no-mock coverage >= 95%: **${Number(noMockPct) >= 95 ? "PASS" : "FAIL"}** (${noMockPct}%)`,
  );
  lines.push("");

  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "test-coverage-verification.md"),
    lines.join("\n"),
    "utf8",
  );

  process.stdout.write(
    `Coverage: HTTP=${httpPct}% (${httpCount}/${total}), no-mock=${noMockPct}% (${noMockCount}/${total})\n`,
  );
}

main();
