# CAD backlog: the grey tools, and what it takes to turn each one on

This is the audit behind the grey buttons in the ribbon, and the plan for turning them on one small batch at a
time. It is written against the code that ships in `index.html` (branch `studio/drawing-full` + this batch), the
kernel in `kernel/` (replicad on OpenCascade WASM), and the tests in `tests/`.

## The rule this backlog follows

A tool is `on` only when all five hold:

1. clicking it opens the workflow that builds the thing — not a label change;
2. the geometry comes from the kernel (or from a solver that actually runs), never from a stand-in shape;
3. the result is a step in the feature tree that can be edited, deleted and rebuilt;
4. invalid input is refused with the measured or named reason;
5. there is a kernel test and a browser test for the click path, the geometry, the rebuild and no page error.

Everything else stays grey with its reason in the tooltip and the popover. A grey button costs an engineer one
click; a green button that does not build costs them a part.

`RIB_ST` therefore keeps three honest non-running states: `no` (not in IDRIS yet), `mk1` (coming in Mark 1) and
`gb` (only for gearbox designs). A tool that is grey is never hidden.

## What is grey today, tool by tool

`on` = runs, `no` = not built, `mk1` = planned, `gb` = gearbox only. "Batch" is the batch that turns it on; "—"
means it is not scheduled in this backlog because the gap is bigger than a batch.

### Sketch

| Tool | State | What the code has | What is missing | Batch |
| --- | --- | --- | --- | --- |
| Spline | `on` (this batch) | closed cubic-Bézier spline through typed points, real kernel edges | — (partial spline / control-point spline is a later step) | 1 |
| Ellipse | `on` (this batch) | `drawEllipse` in the kernel, extruded/revolved as usual | — (partial ellipse later) | 1 |
| Sketch Correction | `on` (this batch) | P1b proposals (join, horizontal, vertical, equal, parallel, perpendicular) with accept/reject/undo, and typed sizes are never changed by a proposal | — (the ribbon now opens the sketcher on its correction list) | 1 |
| Convert Entities | `on` (shipped) | `s21cConvert`: the kernel's HLR projection of the model, converted curve by curve — a projected line stays a line, a projected circle becomes two three-point arcs, so the sketch stays lines and arcs and builds exactly. A projected ellipse or spline is refused by name, never flattened | — (a projected B-spline stays out until the sketch can hold splines proper) | 2b |
| Mirror Entities | `on` (shipped) | `p1Mirror`: an exact 2D reflection of the selected entities about a centre line; a mirrored arc is still an arc | — (copies carry no relations of their own, and the note says so) | 2 |
| Sketch Pattern | `on` (shipped) | `p1Pattern`: linear (dx, dy) and circular (angle about a centre) copies, 2–200 instances, inside the same sketch step | — (same note about relations) | 2 |
| Text | `no` | the kernel bundle has `drawText`, no font file is shipped | a licensed font asset (opentype), then the emboss/cut path (see Wrap/Emboss) | 8 |

### Features

| Tool | State | What the code has | What is missing | Batch |
| --- | --- | --- | --- | --- |
| Boundary Boss/Base | `no` | loft between sketches | a two-direction boundary fill (curves in U and V): `BRepOffsetAPI_MakeFilling` is in the kernel, the wrapper that feeds it two curve sets is not | 6 |
| Variable Fillet | `no` | constant-radius `fillet()` with edge finders | `BRepFilletAPI_MakeFillet` with a radius per point along the edge, plus a way to pick that edge | 7 |
| Dome | `no` | sphere, cut, fuse | a cap trimmed by the face outline and fused; the honest version is a spherical cap intersected with the face region | 4 |
| Wrap / Emboss | `no` | nothing | project a sketch onto a face (planar or cylindrical) and thicken along the normals: `BRepProj_Projection` + offset, neither wrapped | 7 |
| Reference Plane | `no` | sketches sit on the strings `XY`/`XZ`/`YZ` + offset | a plane registry: `buildPart` and the viewer take a plane object, sketches reference it by id, and the grid follows | 3 |
| Reference Axis | `no` | patterns turn about a field value | the same registry for axes, and the pattern/revolve fields that can point at one | 3 |
| Curve Pattern | `no` | `repeat` translates/rotates a feature | replay a feature along a sampled path with orientation and instance culling | 8 |
| Fill Pattern | `no` | `repeat` | instance placement inside a boundary with a point-in-face test and a spacing/angle rule | 8 |
| Split | `no` | one `body` in `buildPart` | multi-body support first (a part can hold several bodies), then a splitter (`BRepAlgoAPI_Splitter`) | 4 |
| Scale | `on` (shipped) | the kernel's `shape.scale(k, point)`, one uniform factor about the origin or the body centre, with the volume before/after in the note | non-uniform and negative factors stay out: the step says why instead of splitting the body | 4 |
| Coordinate System | `no` | nothing | nothing consumes a named CSYS: mates and patterns take field values, exports take the model origin. Grey until a consumer exists | — |
| Thicken (Features tab) | `no`, by design | Surface → Thicken does the work | nothing: this copy exists only so the tool is where SolidWorks users look. It now opens Surface → Thicken instead of asking IDRIS in chat. Do not implement it twice | 0 |

### Surface

| Tool | State | What the code has | What is missing | Batch |
| --- | --- | --- | --- | --- |
| Boundary Surface | `on` (shipped) | `s21iBoundary`: the curves of the body are split into two directions by the panel's switch; the first direction is lofted by the kernel (`BRepOffsetAPI_ThruSections` through each curve as a wire), every curve of the second direction must land on that loft (the gap is `BRepExtrema_DistShapeShape`), and when the second direction holds two curves or more its own loft is measured too and must come to the same patch | — (a true network surface — a Gordon build through crossing curves, which OCCT has no public builder for — is not what this is: the second direction is constrained to the first direction's loft) | 6 |
| Filled Surface | `on` (shipped) | `s21gFill`: the kernel's `BRepOffsetAPI_MakeFilling` over the boundary edges you pick on the body (viewport click picks the edge nearest the pointer, or tick the list), with the measured patch area in the note | — (continuity/support faces and patches between non-connected edges stay out: the kernel refuses what is not one boundary) | 6 |
| Trim Surface | `on` (shipped) | `s21hTrim`: the surface body is split by the plane of a face you pick on the model (`BRepAlgoAPI_Splitter` with a face made on that plane; a viewport click picks the face whose centre is under the pointer, or pick it in the list), and the pieces on the chosen side of that face's normal are kept, with the kept area and the area before measured | — (a cutting plane that misses the surface leaves it whole, and a curved face cannot supply a cutting plane) | 6 |
| Delete Face | `no` | nothing | remove faces and heal the gap (`ShapeFix`), and redefine the solid when the gap cannot be healed | 6 |

### Sheet Metal

| Tool | State | Why it is grey | What it needs | Batch |
| --- | --- | --- | --- | --- |
| Hem | `no` | the sector model's 180° fold puts the outer surface back through the plate, so the kernel merges the sheet with itself (measured, in the tooltip) | a fold model that carries material on one side of the neutral line, not an annular sector | 9 |
| Jog | `no` | the second bend leaves the lower plate inside the web it just made: the sheet passes through itself | the same fold model, with a web between the two bends | 9 |
| Forming Tool | `no` | louvres/embosses/lances are a punch library, not a bend | a punch form library and the deformed-sheet build | 9 |

### Weldments

| Tool | State | Why it is grey | What it needs | Batch |
| --- | --- | --- | --- | --- |
| Trim/Extend | `no` | on a hollow section the walls of two members cross as separate pieces: the boolean breaks the frame into four solids (one corner of two SHS 40×40×3 is 2 706 mm³ of crossing walls) | model the joint as a cope on the member (a profile-shaped notch), not a boolean on the walls. `member.trim` already cuts shared corners; that is the shape this must grow from | 10 |

### Assembly

| Tool | State | Why it is grey | What it needs | Batch |
| --- | --- | --- | --- | --- |
| Motion Study | `no` | the kernel builds static solids; the app's mates are **measured**, not solved. An animation needs a driving constraint, a time step and a kinematic solve | a constraint solver and a time-domain integrator, in the engine, with the assembly rebuilt each step. Until that runs, the closest real answer is Collision Detection along a travel, which is `on` | — (blocked) |

### Evaluate

| Tool | State | What the code has | What is missing | Batch |
| --- | --- | --- | --- | --- |
| Curvature / Zebra | `no` | face normals and areas; the viewer draws B-rep faces | per-face curvature (`BRepLProp_SLProps`) and a reflection-line shader. The measurement is a kernel job, the stripes are a render job | 11 |
| Edit Sizes on the Model | `gb` | the gearbox solver rebuilds and re-checks | nothing for a part: it is **by design** gearbox-only. A part is edited through its feature tree (edit the step, rebuild), which is the honest path; the grey button says "for gearbox designs" and offers the gearbox demo. Keep this restriction | — (keep) |

### Manage

| Tool | State | Why it is grey | What it needs | Batch |
| --- | --- | --- | --- | --- |
| Parameters | `on` (shipped) | `s21eResolve`: a named size table, and a numeric field may hold a parameter's name instead of a number. Values are resolved before any step runs, so one number drives several steps; a name that is not defined is refused by the step that uses it, with the name | — (arithmetic between parameters, e.g. `L * 2`, is the next step; today a field holds one name or one number) | 5 |
| Configurations | `on` (shipped) | `s21eTable`: named configurations that override single parameter values; switching one rebuilds the part through the kernel, so both are real builds | — (per-configuration feature suppression is not in this batch) | 5 |

## The batches

Each batch is one PR, one branch, one set of tests. A batch ships only the tools whose rows above are complete.

### Batch 0 — this PR: the audit, and the two duplicates made honest

* this document, with the measured reasons the grey tools already carry;
* Features → Thicken redirects to Surface → Thicken (one implementation, one name);
* no status is moved to `on` in this batch.

Tests: no behaviour change beyond the redirect; `git diff --check`, the existing unit suite.

### Batch 1 — this PR: the first sketch curves (Ellipse, closed spline, Sketch Correction entry)

* Sketch → Ellipse: major/minor diameter, real ellipse arcs, extruded/revolved/swept like any profile;
* Sketch → Spline: a closed cubic-Bézier spline through typed points, exact through every point, closed on itself;
* both refused with a named reason (minor > major, < 3 points, duplicate points, self-crossing list);
* both are sketch steps in the tree, editable, and rebuild; Smart Dimension can drive the ellipse's major diameter;
* Sketch Correction's ribbon button opens the sketcher on its correction list (the P1b proposals were already
  implemented but unreachable from the ribbon).

Tests: `tests/s21-sketch-curves.test.mjs` (kernel: volumes, faces, refusals, rebuild, dimension) and
`tests/s21-sketch-curves.spec.mjs` (browser: ribbon click → form → Add & build → tree → edit → rebuild → no page
error).

### Batch 2 — Mirror Entities and Sketch Pattern (shipped)

Both run from the sketch panel: select the entities (viewport click or the entity list), set the centre line or the
spacing, press the button, and the copies are added to the same sketch step. A mirrored arc stays an arc because it
is three reflected points, and the kernel builds the sketch exactly as before. Kernel test:
`tests/s21b-sketch-modify.test.mjs` (a half profile mirrored into a closed 40 × 10 one is 2 000 mm³). Browser test:
`tests/s21b-sketch-modify.spec.mjs`.

**Batch 2b — Convert Entities (shipped).** The sketch panel's Convert Entities runs the kernel's HLR projection on
the named plane and walks the returned curves: `LINE` becomes a sketch line, `CIRCLE` becomes two three-point arcs
on the same circle, a zero-length curve is dropped with a count, and anything else (`ELLIPSE`, `BSPLINE_CURVE`,
`BEZIER_CURVE` …) is refused by name rather than approximated into a polygon. Kernel test:
`tests/s21c-convert.test.mjs` (a 40 × 30 × 20 box projects as 4 lines that extrude to 14 400 mm³, XZ of the same
box is 40 × 20, a circle stays two arcs on r = 10). Browser test: `tests/s21c-convert.spec.mjs` (ribbon → sketcher →
convert → 4 entities → save → extrude → 38 400 mm³ total, and the no-body refusal).

### Batch 3 — Reference Plane and Reference Axis

`buildPart` and the viewer learn a plane/axis object; a sketch can name one instead of `XY + offset`; patterns and
revolves can point at an axis. Prerequisite for Boundary, Curve Pattern and Fill Pattern. Acceptance: a sketch on
an offset/angled plane extrudes to the same volume as the equivalent `XY + offset` sketch, and the grid and normal
view follow the plane.

### Batch 4 — Scale (shipped), then Dome and Split

**Shipped: Scale.** One uniform factor about the origin or the body centre, the kernel scaling the body and the
step reporting the measured volume before and after (×k³). Negative and zero factors are refused on screen, and a
failed step is marked in the tree and skipped. Kernel test: `tests/s21c-scale.test.mjs`; browser test:
`tests/s21c-scale.spec.mjs`.

**Batch 4b — Dome and Split.** Dome needs the top face's outline as a region to trim a spherical cap against;
Split needs `buildPart` to hold several bodies (it holds one `body` today). Neither is a rename away, so both stay
grey with those reasons.

### Batch 5 — Parameters and Configurations (shipped)

Manage → Parameters opens the table: a named size, and any numeric field of any step can hold that name instead of a
number (the field remembers the name in the step's shadow map, so the form still shows it after the build resolves
it). Values are resolved once per build, before any step runs, and a name the part does not define is refused **by
the step that uses it**, with the name — never read as 0 or NaN. Configurations are named override sets of those
values: switching one rebuilds the part through the kernel.

Kernel test `tests/s21e-params.test.mjs`: `L = 40` → 24 000 mm³, `L = 50` → 30 000 mm³ (the step was not baked), a
configuration with `L = 60` → 36 000 and back to Default → 30 000, an undefined name (`Width`) refused by the box
step with its name and no body built, one parameter driving both a Box `L` and an Extrude distance, and a typed
number left untouched. Browser test `tests/s21e-params.spec.mjs`: the Manage tab, the panel, naming a size, typing
the name into the box's `L` field, changing the value, adding a configuration that overrides it, switching back, and
the refusal — with no page error.

Not in this batch: arithmetic between parameters (`L * 2`) and per-configuration suppression of a step.

### Batch 6 — the surfaces that need new kernel wrappers

**Shipped in this batch: Filled Surface.** Surface → Filled Surface lists the body's own B-rep edges; a click in the
viewport picks the nearest one (the end points are projected through the same viewer the app draws with) and the
panel's list ticks them too. The patch is built by `BRepOffsetAPI_MakeFilling` through `R.getOC()`, its area is
measured on the returned face, and edges that are not one boundary are refused by the kernel with its own message.
Kernel test `tests/s21g-fill.test.mjs` (four top edges of a 40 × 30 × 20 box → 1 200 mm², the body unchanged, the
one-edge refusal, the rebuild at another edge order) and browser test `tests/s21g-fill.spec.mjs` (ribbon → panel →
viewport pick → four ticks → Build → 1 200 mm² and the note, then the one-edge refusal, no page error).

**Also shipped in this batch: Trim Surface.** Surface → Trim Surface lists the body's planar faces; a viewport click
picks the face whose centre is under the pointer (the list stays for faces that overlap on screen), and the picked
face supplies the cutting plane and the normal that decides which half survives. The split is
`BRepAlgoAPI_Splitter` with a face made on that plane, kept pieces are chosen by the kernel's own piece centres, and
the step notes the kept area out of the area before. Kernel test `tests/s21h-trim.test.mjs` (a 200 × 160 planar
surface cut at x = 20 → 12 800 mm² kept of 32 000, the other side 19 200, both halves adding up, the no-surface
refusal and the wrong-face refusal) and browser test `tests/s21h-trim.spec.mjs` (ribbon → box → sketch → Planar
Surface → Trim Surface → viewport pick of the +X face → 12 800 mm² in the step and the note, no page error).

**Also shipped in this batch: Boundary Surface.** Surface → Boundary Surface lists the body's own edges and has a
switch for the direction a click adds to: a viewport click picks the nearest curve (end points projected through the
same viewer) and the direction switch decides whether it joins direction 1 or direction 2. The first direction is
lofted by the kernel (`BRepOffsetAPI_ThruSections` through each curve as a wire); every curve of the second direction
must land on that loft, and the distance from its end points to the loft is `BRepExtrema_DistShapeShape`'s, so a
guide that misses is refused with the millimetres it misses by. With two curves in the second direction, its own loft
is built and measured as well: the two directions have to bound the same patch, and a mismatch is refused with both
areas. Kernel test `tests/s21i-bound.test.mjs` (two long and two short top edges of a 40 × 30 × 20 box → 1 200 mm²
with both directions recorded, the one-curve and no-guide refusals with their counts, the 600 vs 1 200 mismatch, the
20 mm guide gap) and browser test `tests/s21i-bound.spec.mjs` (ribbon → box → panel list → viewport pick into
direction 1 → switch → pick into direction 2 → Build → 1 200 mm², then the one-curve refusal, no page error).


Boundary Surface, Filled Surface, Trim Surface, Delete Face, and Boundary Boss/Base. This is the first batch that
writes OpenCascade bindings. Each tool must report the area/volume the kernel measures, and a trim or a delete that
cannot be healed must say so instead of returning a shell with a hole.

**Measured, not assumed (probe of `R.getOC()` in the bundled kernel):** the raw OpenCascade module already exposes
`BRepOffsetAPI_MakeFilling`, `BRepAlgoAPI_Splitter`, `BRepAlgoAPI_Section`, `BRepFilletAPI_MakeFillet`,
`BRepFilletAPI_MakeChamfer`, `BRepOffsetAPI_MakeThickSolid`, `BRepAdaptor_Surface`, `TopExp_Explorer`,
`BRepBuilderAPI_MakeFace/MakeWire/MakeSolid/MakeSewing/Transform`, `BRepCheck_Analyzer` and
`BRepExtrema_DistShapeShape`, so the JS wrapper is what is missing, not the binding. Not in this build:
`BRepLProp_SLProps`, `GeomLProp_SLProps`, `BRepProj_Projection`, `ShapeFix_Shape`, `BRep_Builder`, `TopExp`,
`GCPnts_QuasiUniformDeflection`.

That changes two things in this backlog: Boundary/Filled Surface (batch 6) and Variable Fillet (batch 7) can be
written against `R.getOC()` without a new WASM build, and Curvature/Zebra (batch 11) has to measure curvature from
`BRepAdaptor_Surface` (its `D2`/`DN` derivatives) instead of the missing `LProp` classes, or wait for a kernel
rebuild. Every tool still has to pass the same five rules at the top of this document.

### Batch 7 — Variable Fillet, Wrap/Emboss, Text

Variable Fillet: `BRepFilletAPI_MakeFillet` with a radius law along the picked edge, refused when the radius does
not fit. Wrap/Emboss and Text: the sketch projected onto a face, then thickened or cut; Text needs the font asset
first, and the tool must name the font.

### Batch 8 — Curve Pattern and Fill Pattern

Replay a feature along a path (with orientation) and fill a boundary with instances. Both need Batch 3 and a
point-in-face test. Acceptance: the instance count is what the spacing implies on the measured path/area, and a
pattern that would leave the boundary is refused or clipped with the count it used.

### Batch 9 — sheet metal Hem, Jog, Forming Tool

Replace the annular-sector fold model with one that carries the sheet on one side of the neutral line, then Hem
and Jog become geometry; Forming Tool needs a punch form library. The flat pattern must keep developing the same
allowance, and the existing sheet-metal tests must still pass unchanged.

### Batch 10 — Weldments Trim/Extend

Model the joint as a cope on the member, not a boolean on the walls. Acceptance: trimming two SHS 40×40×3 members
at a corner gives **one** solid per member with the cope cut, not four separate solids, and the cut list keeps its
two rows.

### Batch 11 — Curvature / Zebra

Measure curvature on each face (`BRepLProp_SLProps`) and draw it as colour or reflection lines. Acceptance: a
cylinder reports 1/R everywhere within tolerance, a plane reports 0, and the view says which quantity it shows.

### Not scheduled

* **Motion Study** — needs a kinematic solver and a time step in the engine. Until that exists the button stays
  grey with that reason; Collision Detection answers the static question today.
* **Coordinate System** — nothing in the app consumes a named CSYS. Revisit when mates or exports need one.
* **Edit Sizes on the Model** — gearbox-only by design; a part is edited through its feature tree.

## The engine-side gaps, in one place

| Capability | In the kernel wrapper today | Needed by |
| --- | --- | --- |
| variable-radius fillet | no (`fillet(radius, finder)` only) | Variable Fillet |
| surface filling / boundary | `BRepOffsetAPI_MakeFilling` (used by Filled Surface) and `BRepOffsetAPI_ThruSections` on curves as wires (used by Boundary Surface, which checks the second direction with `BRepExtrema_DistShapeShape`); no true network/Gordon surface | Boundary Boss |
| trim/split on shells | `BRepAlgoAPI_Splitter` on a face (used by Trim Surface); not on a shell with another shell | Split |
| heal / remove face | no | Delete Face |
| projection of a sketch onto a face | no | Wrap/Emboss, Text |
| curvature at a point on a face | no | Curvature / Zebra |
| cope on a hollow section | no | Weldments Trim/Extend |
| fold model with material on one side | no (sector model) | Hem, Jog |
| named plane / axis as a sketch host | no (strings + offset) | Reference Plane/Axis, Curve/Fill Pattern |
| multi-body part | no (one `body`) | Split, Delete Face on one body |
| parameter table + expressions | no | Parameters, Configurations |
| kinematic solver with time | no (mates are measured) | Motion Study |
