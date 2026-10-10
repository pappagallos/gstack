import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

test("컴파일된 실행기가 용량 옵션을 검증하고 재개 시 정책을 보존한다", () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "cso-budget-cli-")),
  );
  const repo = path.join(root, "repo"),
    state = path.join(root, "state");
  const launcher = path.resolve(import.meta.dir, "../bin/gstack-cso-launcher");
  const command = (args: string[]) =>
    spawnSync(launcher, args, {
      cwd: root,
      encoding: "utf8",
      env: { HOME: root, GSTACK_HOME: state, PATH: "/usr/bin:/bin" },
      timeout: 30_000,
    });
  try {
    expect(
      spawnSync("/usr/bin/git", ["init", "-q", repo], { timeout: 5_000 })
        .status,
    ).toBe(0);
    fs.writeFileSync(path.join(repo, "app.js"), "export const ready = true;\n");
    for (const limit of ["0", "1025", "1.5", "NaN", "Infinity", "1e2", ""]) {
      const invalid = command([
        "start",
        "--repo",
        repo,
        "--max-source-mib",
        limit,
        "--offline",
      ]);
      expect(invalid.status).not.toBe(0);
      expect(invalid.stderr).toContain("INVALID_ARGUMENT");
    }
    for (let i = 0; i < 2; i++)
      fs.writeFileSync(
        path.join(repo, `asset-${i}.bin`),
        Buffer.alloc(600 * 1024),
      );
    const limited = command([
      "start",
      "--repo",
      repo,
      "--max-source-mib",
      "1",
      "--offline",
    ]);
    expect(limited.status).not.toBe(0);
    expect(limited.stderr).toContain("1 MiB");
    const started = command([
      "start",
      "--repo",
      repo,
      "--max-source-mib",
      "128",
      "--offline",
    ]);
    expect(started.status).toBe(0);
    const run = JSON.parse(started.stdout);
    expect(run.policy.maxSourceMiB).toBe(128);
    const resumed = command(["resume", run.runId]);
    expect(resumed.status).toBe(0);
    expect(JSON.parse(resumed.stdout).policy).toEqual(run.policy);
    expect(command(["finish", run.runId]).status).toBe(0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
