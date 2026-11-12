// Live's own interface (Ferrum docs/plan/apps-ui.md), built with Ferrum-Frontend's packages and
// libraries from the sibling checkout: ../../ferrum/web, where CI checks it out too.
//
// The one library of its own is moq's two web components (@moq/watch, @moq/publish: ui/package.json,
// the exact versions docs/moq.md pins). They are bundled into this release as lazy chunks, so no page
// ever loads a script from a third-party address; the alias keeps them resolving from ui/node_modules
// while every other library resolves from Ferrum-Frontend.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ferrumApp } from "../../ferrum/web/packages/build/vite.mjs";

const config = ferrumApp(import.meta.url);
const moq = fileURLToPath(new URL("./node_modules/@moq/", import.meta.url));
config.resolve.alias.push({ find: /^@moq\/(watch|publish)\/element$/, replacement: `${moq}$1/element.js` }, { find: /^@moq\/publish\/support$/, replacement: `${moq}publish/support/index.js` });

// moq's Opus fallback (for browsers with no WebCodecs audio) loads its WebAssembly from beside its own chunk, by a path
// worked out at run time, so the bundler cannot see it: the two files are copied there, from the same package, so
// that fallback too comes from this release and not from a CDN.
const libav = fileURLToPath(new URL("./node_modules/@libav.js/variant-opus-af/dist/", import.meta.url));
config.plugins.push({
  name: "live:libav-opus",
  generateBundle() {
    for (const f of readdirSync(libav)) if (/-opus-af\.wasm\.(mjs|wasm)$/.test(f)) this.emitFile({ type: "asset", fileName: `assets/${f}`, source: readFileSync(libav + f) });
  },
});

// The public pages load the two components from the app's own address, at paths that name their versions
// (assets/moq-watch-0.6.6.js, assets/moq-publish-0.5.6.js), whatever the interface's own hashed names are. They are
// extra entries of the build; what they import is hashed beside them. The build fails if either is missing.
const root = fileURLToPath(new URL(".", import.meta.url));
const version = (pkg) => JSON.parse(readFileSync(join(moq, pkg, "package.json"), "utf8")).version;
const entries = { "moq-watch": `moq-watch-${version("watch")}`, "moq-publish": `moq-publish-${version("publish")}` };
const rollup = (config.build.rollupOptions ??= {});
rollup.input = { index: join(root, "index.html"), "moq-watch": join(root, "src/moq-watch.ts"), "moq-publish": join(root, "src/moq-publish.ts") };
rollup.preserveEntrySignatures = "strict";
rollup.output = { ...rollup.output, entryFileNames: (c) => (entries[c.name] ? `assets/${entries[c.name]}.js` : "assets/[name]-[hash].js") };
config.plugins.push({
  name: "live:moq-entries",
  generateBundle(_o, bundle) {
    for (const file of Object.values(entries)) if (!bundle[`assets/${file}.js`]) this.error(`the build did not emit assets/${file}.js: the public pages need it`);
  },
});

export default config;
