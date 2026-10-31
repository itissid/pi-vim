import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceDirectory = fileURLToPath(new URL("../", import.meta.url));

test("real Pi CLI loads a standalone checkout without local peer dependencies", (t) => {
  const cli = process.env.PI_VIM_TEST_CLI ?? "pi";
  const probe = spawnSync(cli, ["--version"], {
    encoding: "utf8",
    timeout: 5_000,
  });
  if (probe.error && "code" in probe.error && probe.error.code === "ENOENT") {
    t.skip("Pi CLI is not installed; set PI_VIM_TEST_CLI to exercise startup");
    return;
  }
  assert.equal(probe.status, 0, probe.stderr);

  const fixture = mkdtempSync(join(tmpdir(), "pi-vim-cli-startup-"));
  try {
    // Copy source, not node_modules: installed development peers would mask
    // native import.meta.resolve failures in Pi's embedded-module loader.
    for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        copyFileSync(
          join(sourceDirectory, entry.name),
          join(fixture, entry.name),
        );
      }
    }
    const env: NodeJS.ProcessEnv = { ...process.env, PI_OFFLINE: "1" };
    delete env.PI_SESSION_FILE;
    delete env.PI_SESSION_ID;
    const result = spawnSync(
      cli,
      [
        "--mode",
        "rpc",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "-e",
        join(fixture, "index.ts"),
        "--session-dir",
        fixture,
      ],
      {
        cwd: fixture,
        env,
        input: '{"type":"get_state","id":"vim-startup"}\n',
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    const responses = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      responses.some(
        (response) => response.id === "vim-startup" && response.success,
      ),
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
