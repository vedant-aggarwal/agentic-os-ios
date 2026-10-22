// Copies app/ into www/ for the native build (app/modules/ and app/work/ included). Demo files (the owner's calendar),
// the service worker, the notes and the development pages stay out of the IPA: the app syncs from the PC and keeps
// its own offline copy. js/data-demo.js stays in: the app shows it under ?data=demo, and data.js imports it.
import { cpSync, rmSync } from "node:fs";
import { basename, extname, join } from "node:path";
const root = join(import.meta.dirname, "..");
const SKIP = new Set(["mock", "sw.js", "motion-lab.html", "system.html", ".DS_Store"]);
rmSync(join(root, "www"), { recursive: true, force: true });
cpSync(join(root, "app"), join(root, "www"), {
  recursive: true,
  filter: (src) => !SKIP.has(basename(src)) && extname(src).toLowerCase() !== ".md",
});
console.log("www/ ready");
