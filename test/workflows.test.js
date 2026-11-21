import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("pushing to main only runs the tests; the Fly.io deploy needs a manual run", () => {
  const y = fs.readFileSync(path.join(root, ".github/workflows/deploy.yml"), "utf8");
  const deploy = y.slice(y.indexOf("\n  deploy:"));
  assert.match(deploy, /if: github\.event_name == 'workflow_dispatch'/, "deploy is manual");
  assert.doesNotMatch(deploy, /event_name != 'pull_request'/, "an automatic deploy would fail without FLY_API_TOKEN and turn main red");
});
