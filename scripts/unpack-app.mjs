// The public build repo carries the web app only as app.bin: a tar.gz of app/ encrypted with AES-256-GCM under the
// APP_KEY repo secret (base64 of 32 bytes), so nothing personal in it is readable there. This puts app/ back before
// build-www.mjs. Without the key or the file, app/ keeps its placeholder: fine for a compile check, an error when
// REQUIRED=true (a build that signs or uploads). Format: "AOS1", IV (12 bytes), GCM tag (16), ciphertext.
// v2\tools\pack-app.ts on the PC writes it (sync-public-build.ps1 -App).
import { createDecipheriv } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const bin = join(root, "app.bin");
const key = Buffer.from(process.env.APP_KEY ?? "", "base64");
if (key.length !== 32 || !existsSync(bin)) {
  const why = existsSync(bin) ? "no APP_KEY secret" : "no app.bin";
  if (process.env.REQUIRED === "true") { console.error(`Web app missing (${why}): run sync-public-build.ps1 -App.`); process.exit(1); }
  console.log(`Building with the placeholder app/ (${why})`);
  process.exit(0);
}
const buf = readFileSync(bin);
if (buf.subarray(0, 4).toString() !== "AOS1") throw new Error("app.bin: unknown format");
const d = createDecipheriv("aes-256-gcm", key, buf.subarray(4, 16));
d.setAuthTag(buf.subarray(16, 32));
const tgz = join(process.env.RUNNER_TEMP ?? root, "app.tgz");
writeFileSync(tgz, Buffer.concat([d.update(buf.subarray(32)), d.final()]));
rmSync(join(root, "app"), { recursive: true, force: true });
execFileSync("tar", ["-xzf", tgz, "-C", root]);
rmSync(tgz);
console.log("Web app unpacked into app/");
