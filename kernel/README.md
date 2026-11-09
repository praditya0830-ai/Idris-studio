# kernel/ — CAD kernel for the IDRIS Part workspace

Loaded only when a part tool (Shape, Sketch, Push/Pull, Hole, Edge, Repeat, Wall, Bodies, Measure) is used.
Runs in the engineer's browser; nothing here runs on the IDRIS server.

| File | What | Licence |
|---|---|---|
| replicad_single.js + replicad_single.wasm | OpenCascade Technology compiled to WebAssembly (replicad-opencascadejs 1.2.1, unmodified) | LGPL-2.1 (LICENSE-opencascade-LGPL-2.1.txt) |
| replicad.js | replicad 1.2.1 (MIT), bundled with flatbush (ISC); text (opentype.js) and manifold are not included | MIT / ISC |

LGPL note: the OpenCascade build is a separate, unmodified file. Anyone can replace `replicad_single.wasm`/`.js`
with another compatible build of the same version. Source: https://github.com/sgenoud/replicad (packages/replicad-opencascadejs)
and https://dev.opencascade.org.
