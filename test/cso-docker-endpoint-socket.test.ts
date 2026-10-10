import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as net from "node:net";
import { dockerEndpoint } from "../lib/cso/docker";
import { executable } from "../lib/cso/process";

let dockerAvailable = false;
try {
  executable("docker");
  dockerAvailable = true;
} catch {}
test.skipIf(process.platform === "win32" || !dockerAvailable)(
  "실제 Unix 소켓과 상대 링크를 정규화하고 일반 파일과 순환 링크를 거부한다",
  async () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "csock-")),
    );
    const socket = path.join(root, "api.sock"),
      server = net.createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socket, resolve);
      });
      fs.symlinkSync("api.sock", path.join(root, "alias.sock"));
      for (const name of ["api.sock", "alias.sock"]) {
        const endpoint = await dockerEndpoint(root, {
          DOCKER_HOST: `unix://${path.join(root, name)}`,
        });
        expect(endpoint.socket).toBe(socket);
        expect(endpoint.inode).toBe(fs.lstatSync(socket).ino);
        expect(endpoint.uri).toBe(`unix://${socket}`);
      }
      fs.writeFileSync(path.join(root, "regular"), "not a socket");
      fs.symlinkSync("cycle", path.join(root, "cycle"));
      for (const name of ["regular", "cycle", "missing"])
        await expect(
          dockerEndpoint(root, {
            DOCKER_HOST: `unix://${path.join(root, name)}`,
          }),
        ).rejects.toMatchObject({ code: "ISOLATION_FAILED" });
      await expect(
        dockerEndpoint(root, { DOCKER_HOST: "tcp://127.0.0.1:2375" }),
      ).rejects.toMatchObject({ code: "ISOLATION_FAILED" });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
