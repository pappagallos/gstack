import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { capture, assertSnapshot } from "../lib/cso/snapshot";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "cso-source-budget-")),
  );
  roots.push(root);
  const repo = path.join(root, "repo"),
    runDir = path.join(root, "run");
  fs.mkdirSync(repo);
  fs.mkdirSync(runDir, { mode: 0o700 });
  const initialized = spawnSync("/usr/bin/git", ["init", "-q", repo], {
    encoding: "utf8",
    timeout: 5_000,
  });
  expect(initialized.status).toBe(0);
  fs.writeFileSync(path.join(repo, "app.js"), "export const ready = true;\n");
  return { root, repo, runDir };
}

test("명시적 용량 확장은 기본 제한을 보존하며 큰 저장소의 소스 식별을 유지한다", async () => {
  const { root, repo, runDir } = fixture();
  for (let i = 0; i < 2; i++)
    fs.writeFileSync(
      path.join(repo, `asset-${i}.bin`),
      Buffer.alloc(33 * 1024 * 1024),
    );
  await expect(capture(repo, runDir)).rejects.toThrow("64 MiB");
  const expanded = path.join(root, "expanded");
  fs.mkdirSync(expanded, { mode: 0o700 });
  const manifest = await capture(repo, expanded, undefined, undefined, {
    maxSourceMiB: 128,
  });
  expect(manifest.entries).toHaveLength(3);
  expect(
    fs.readFileSync(path.join(expanded, "snapshot", "app.js"), "utf8"),
  ).toBe("export const ready = true;\n");
  for (const entry of manifest.entries.filter((item) =>
    item.path.endsWith(".bin"),
  )) {
    expect(entry.originalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.transformation).toContain("withheld");
    expect(entry.executionHash).toBeUndefined();
  }
  expect(() => assertSnapshot(expanded, manifest)).not.toThrow();
}, 30_000);

test.each([0, -1, 1.5, 1025, Infinity, NaN])(
  "잘못된 용량 %s는 읽기 전에 거부한다",
  async (maxSourceMiB) => {
    const { repo, runDir } = fixture();
    await expect(
      capture(repo, runDir, undefined, undefined, { maxSourceMiB }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  },
);

test("확장된 전체 한도에서도 파일 하나의 64 MiB 상한을 유지한다", async () => {
  const { repo, runDir } = fixture();
  const fd = fs.openSync(path.join(repo, "large.bin"), "w");
  fs.ftruncateSync(fd, 65 * 1024 * 1024);
  fs.closeSync(fd);
  await expect(
    capture(repo, runDir, undefined, undefined, { maxSourceMiB: 128 }),
  ).rejects.toThrow("67108864-byte");
});
