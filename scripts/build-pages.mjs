import { mkdir, readFile, writeFile, cp, rm, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
const root = resolve(import.meta.dirname, ".."),
  dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "assets/browser"), { recursive: true });
await mkdir(resolve(dist, "assets/vendor/core"), { recursive: true });
await mkdir(resolve(dist, "assets/vendor/lang"), { recursive: true });
await mkdir(resolve(dist, "assets/demo"), { recursive: true });
let html = await readFile(resolve(root, "apexcoach/static/index.html"), "utf8");
html = html
  .replace('<html lang="de">', '<html lang="de" data-runtime="browser">')
  .replaceAll("/static/", "./assets/")
  .replace(
    "MP4, MOV, MKV, WebM · bis 2 GiB / 2 h",
    "MP4 (H.264), WebM · lokale Browseranalyse",
  )
  .replace("Video wird hochgeladen", "Video wird lokal gespeichert");
html = html.replace(
  "<footer>",
  "<footer>GitHub stellt nur die Website und das OCR-Modell bereit. Deine Videos und Notizen bleiben in diesem Browser. Browserdaten nicht löschen, bevor du benötigte Dateien exportiert hast. ",
);
await writeFile(resolve(dist, "index.html"), html);
await writeFile(resolve(dist, ".nojekyll"), "");
for (const file of ["app.js", "style.css"])
  await cp(
    resolve(root, "apexcoach/static", file),
    resolve(dist, "assets", file),
  );
await build({
  entryPoints: [resolve(root, "browser/client.mjs")],
  outfile: resolve(dist, "assets/browser/client.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "eof",
});
await cp(
  resolve(root, "node_modules/tesseract.js/dist/worker.min.js"),
  resolve(dist, "assets/vendor/worker.min.js"),
);
await cp(
  resolve(root, "node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt"),
  resolve(dist, "assets/vendor/worker.min.js.LICENSE.txt"),
);
for (const file of await readdir(
  resolve(root, "node_modules/tesseract.js-core"),
))
  if (file.includes("lstm") && (file.endsWith(".js") || file.endsWith(".wasm")))
    await cp(
      resolve(root, "node_modules/tesseract.js-core", file),
      resolve(dist, "assets/vendor/core", file),
    );
await cp(
  resolve(
    root,
    "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  ),
  resolve(dist, "assets/vendor/lang/eng.traineddata.gz"),
);
for (const [source, target] of [
  ["browser/demo.mp4", "assets/demo/demo.mp4"],
  ["browser/demo.profile.json", "assets/demo/profile.json"],
])
  await cp(resolve(root, source), resolve(dist, target));
const notices = [];
for (const pkg of ["tesseract.js", "tesseract.js-core", "fflate"])
  notices.push(
    `# ${pkg}\n\n${await readFile(resolve(root, "node_modules", pkg, pkg === "tesseract.js" ? "LICENSE.md" : "LICENSE"), "utf8")}`,
  );
notices.push(
  "# English OCR weights\nDistributed by @tesseract.js-data/eng, MIT package; underlying Tesseract tessdata model from https://github.com/tesseract-ocr/tessdata (Apache-2.0).",
);
notices.push(await readFile(resolve(root, "browser/model-license.md"), "utf8"));
await writeFile(resolve(dist, "THIRD-PARTY-NOTICES.txt"), notices.join("\n\n"));
console.log("GitHub-Pages-Browserfassung gebaut: dist/");
