import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { capture, assertSnapshot } from "../lib/cso/snapshot";
import { readJson, readSnapshotJson } from "../lib/cso/state";

test("파일 수가 많은 저장소의 1 MiB 초과 목록을 누락 없이 저장한다", async () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "cso-manifest-")),
  );
  const repo = path.join(root, "repo"),
    run = path.join(root, "run");
  try {
    fs.mkdirSync(repo);
    fs.mkdirSync(run, { mode: 0o700 });
    expect(
      spawnSync("/usr/bin/git", ["init", "-q", repo], { timeout: 5_000 })
        .status,
    ).toBe(0);
    for (let i = 0; i < 4000; i++)
      fs.writeFileSync(path.join(repo, `source-${i}.js`), "export {};\n");
    const manifest = await capture(repo, run);
    expect(manifest.entries).toHaveLength(4000);
    expect(fs.statSync(path.join(run, "snapshot.json")).size).toBeGreaterThan(
      1024 * 1024,
    );
    expect(() => readJson(path.join(run, "snapshot.json"))).toThrow(
      "Invalid private state file",
    );
    const retained = readSnapshotJson(path.join(run, "snapshot.json"));
    expect(retained.entries).toHaveLength(4000);
    expect(retained.originalHash).toBe(manifest.originalHash);
    expect(() => assertSnapshot(run, retained)).not.toThrow();
    const linked = path.join(run, "linked.json");
    fs.linkSync(path.join(run, "snapshot.json"), linked);
    expect(() => readSnapshotJson(linked)).toThrow(/hard link/);
    fs.unlinkSync(linked);
    const oversized = path.join(run, "oversized.json"),
      fd = fs.openSync(oversized, "w", 0o600);
    fs.ftruncateSync(fd, 16 * 1024 * 1024 + 1);
    fs.closeSync(fd);
    expect(() => readSnapshotJson(oversized)).toThrow(
      "Invalid private state file",
    );
    expect(() => assertSnapshot(run, manifest)).not.toThrow();
    const launcher = path.resolve(
      import.meta.dir,
      "../bin/gstack-cso-launcher",
    );
    const command = (args: string[]) =>
      spawnSync(launcher, args, {
        cwd: root,
        encoding: "utf8",
        timeout: 60_000,
        maxBuffer: 32 * 1024 * 1024,
        env: {
          HOME: root,
          GSTACK_HOME: path.join(root, "state"),
          PATH: "/usr/bin:/bin",
        },
      });
    const started = command(["start", "--repo", repo, "--offline"]);
    expect(started.status).toBe(0);
    const id = JSON.parse(started.stdout).runId;
    const inspected = command(["inspect", id]);
    expect(inspected.status).toBe(0);
    expect(JSON.parse(inspected.stdout).manifest.entries).toHaveLength(4000);
    expect(command(["read", id, "source-0.js"]).stdout.trim()).toBe(
      "export {};",
    );
    expect(command(["finish", id]).status).toBe(0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 120_000);
