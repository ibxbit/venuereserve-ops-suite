#!/usr/bin/env node
// Generates a deterministic endpoint inventory by parsing the backend
// route source files under backend/src/routes/*.js.
//
// Inputs resolved:
//   - backend/src/routes/index.js  (direct endpoints + CRUD resources[])
//   - backend/src/routes/reservations.js
//   - backend/src/routes/commerce.js
//   - backend/src/routes/community.js
//   - backend/src/routes/security.js
//   - backend/src/routes/crud-router.js (shape of the 5 CRUD routes)
//
// Outputs:
//   - repo/.tmp/generated-endpoint-inventory.json
//   - repo/.tmp/generated-endpoint-inventory.md

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const routesDir = path.join(repoRoot, "backend", "src", "routes");
const tmpDir = path.join(repoRoot, ".tmp");

const API_PREFIX = "/api/v1";

const routerVarToGroup = {
  apiRouter: "direct",
  reservationRouter: "reservations",
  commerceRouter: "commerce",
  communityRouter: "community",
  securityRouter: "security",
};

function read(file) {
  return fs.readFileSync(path.join(routesDir, file), "utf8");
}

function collectDirectRoutes(source, routerVar) {
  const methodRegex = new RegExp(
    `${routerVar}\\.(get|post|put|delete|patch)\\(\\s*"([^"]+)"`,
    "g",
  );
  const results = [];
  let match;
  while ((match = methodRegex.exec(source)) !== null) {
    results.push({
      method: match[1].toUpperCase(),
      path: match[2],
    });
  }
  return results;
}

function collectResources(source) {
  const startMarker = "const resources = [";
  const startIdx = source.indexOf(startMarker);
  if (startIdx < 0) return [];
  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx + startMarker.length - 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) return [];
  const block = source.slice(startIdx, endIdx + 1);
  const entityRegex = /entityName:\s*"([^"]+)"/g;
  const names = [];
  let match;
  while ((match = entityRegex.exec(block)) !== null) {
    names.push(match[1]);
  }
  return names;
}

function buildCrudEndpoints(entityName) {
  return [
    { method: "GET", path: `/${entityName}` },
    { method: "GET", path: `/${entityName}/:id` },
    { method: "POST", path: `/${entityName}` },
    { method: "PUT", path: `/${entityName}/:id` },
    { method: "DELETE", path: `/${entityName}/:id` },
  ];
}

function toFullPath(route) {
  return `${API_PREFIX}${route.path}`;
}

function uniqueByKey(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = `${item.method} ${item.fullPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function main() {
  const indexSrc = read("index.js");
  const reservationsSrc = read("reservations.js");
  const commerceSrc = read("commerce.js");
  const communitySrc = read("community.js");
  const securitySrc = read("security.js");

  const groups = {
    direct: collectDirectRoutes(indexSrc, "apiRouter"),
    reservations: collectDirectRoutes(reservationsSrc, "reservationRouter"),
    commerce: collectDirectRoutes(commerceSrc, "commerceRouter"),
    community: collectDirectRoutes(communitySrc, "communityRouter"),
    security: collectDirectRoutes(securitySrc, "securityRouter"),
  };

  const resourceNames = collectResources(indexSrc);
  const crud = [];
  for (const entity of resourceNames) {
    for (const route of buildCrudEndpoints(entity)) {
      crud.push({ ...route, resource: entity });
    }
  }

  const flat = [];
  for (const [group, items] of Object.entries(groups)) {
    for (const item of items) {
      flat.push({
        group,
        method: item.method,
        path: item.path,
        fullPath: toFullPath(item),
      });
    }
  }
  for (const item of crud) {
    flat.push({
      group: "crud",
      resource: item.resource,
      method: item.method,
      path: item.path,
      fullPath: toFullPath(item),
    });
  }

  const unique = uniqueByKey(flat);
  unique.sort(
    (a, b) =>
      a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method),
  );

  const jsonOut = {
    api_prefix: API_PREFIX,
    generated_at: new Date().toISOString(),
    total: unique.length,
    endpoints: unique,
  };

  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "generated-endpoint-inventory.json"),
    JSON.stringify(jsonOut, null, 2),
    "utf8",
  );

  const mdLines = [];
  mdLines.push("# Generated Endpoint Inventory");
  mdLines.push("");
  mdLines.push(`- API prefix: \`${API_PREFIX}\``);
  mdLines.push(`- Total endpoints: **${unique.length}**`);
  mdLines.push(`- Generated at: ${jsonOut.generated_at}`);
  mdLines.push("");
  mdLines.push("| # | Method | Path | Group |");
  mdLines.push("|---|---|---|---|");
  unique.forEach((item, idx) => {
    mdLines.push(
      `| ${idx + 1} | \`${item.method}\` | \`${item.fullPath}\` | ${item.group}${item.resource ? ` (${item.resource})` : ""} |`,
    );
  });
  mdLines.push("");
  fs.writeFileSync(
    path.join(tmpDir, "generated-endpoint-inventory.md"),
    mdLines.join("\n"),
    "utf8",
  );

  process.stdout.write(
    `Wrote ${unique.length} endpoints to repo/.tmp/generated-endpoint-inventory.(json|md)\n`,
  );
}

main();
