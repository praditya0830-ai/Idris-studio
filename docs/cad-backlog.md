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
| Text | `on` (this batch) | `idrisTextRects`: a 5×7 block font bundled in the page as a cell table, fused cell by cell into one closed profile and extruded as a boss or cut as a deboss, with the profile area and the measured volume in the note | proportional letterforms and multi-line text: the bundled font is a single 5×7 cell grid, and a character it does not carry is refused by name | A |

### Features

| Tool | State | What the code has | What is missing | Batch |
| --- | --- | --- | --- | --- |
<<<<<<< HEAD
| Boundary Boss/Base | `no` | loft between sketches | a two-direction boundary fill (curves in U and V) — no `MakeFilling`/boundary builder in the wrapper | 6 |
=======
| Boundary Boss/Base | `on` (shipped) | `s21kBoundarySolid`: the same two-direction boundary as Boundary Surface (`s21iBoundary`: the first direction is lofted by the kernel, every curve of the second must land on that loft, and the second direction's own loft is measured when there are two or more) is made into a solid — the patch is offset by the thickness (`BRepOffsetAPI_MakeOffsetShape`), a wall is lofted from each boundary curve of the patch to the matching curve of the offset (`BRepOffsetAPI_ThruSections`), and patch, offset and walls are sewn into one shell (`BRepBuilderAPI_Sewing`) and made a solid (`BRepBuilderAPI_MakeSolid`); both thickness directions are built and the one that adds material to the body — decided by the kernel's volumes — is fused in, and the step records both patch areas and the volume added | the curves come from the **body**, not from loose sketch entities (a sketch is picked up once it is a body, exactly as for Boundary Surface); a patch whose walls cannot be closed into a valid positive-volume solid is refused with the thickness it could not close, and a patch that lies inside the body adds nothing and is refused instead of silently doing nothing | 6 |
>>>>>>> 4995cc5 (Boundary Boss/Base thickens the two-direction patch into a solid the kernel measures)
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
| Boundary Surface | `no` | loft/sweep/planar | the same two-direction boundary fill as Boundary Boss/Base | 6 |
<<<<<<< HEAD
| Filled Surface | `no` | Planar Surface covers flat patches | a filling builder (`BRepOffsetAPI_MakeFilling`) with continuity and support faces | 6 |
=======
| Filled Surface | `on` (shipped) | `s21gFill`: the kernel's `BRepOffsetAPI_MakeFilling` over the boundary edges you pick on the body (viewport click picks the edge nearest the pointer, or tick the list), with the measured patch area in the note | — (continuity/support faces and patches between non-connected edges stay out: the kernel refuses what is not one boundary) | 6 |
>>>>>>> ec32503 (Filled Surface patches the boundary edges you pick, and the kernel measures the patch)
| Trim Surface | `no` | knit, offset | trim one shell with another or with a sketch: the splitter on shells, then the kept side | 6 |
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
| Parameters | `mk1` | feature fields are edited one step at a time | a named parameter table, expressions in numeric fields, and a rebuild that resolves them in dependency order | 5 |
| Configurations | `no` | one feature tree per part | named configurations that override parameters and feature states, with the same rebuild and a test that both configurations build | 5 |

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

### Batch 5 — Parameters and Configurations

A parameter table (`L`, `W`, `R` …), expressions in numeric fields, and named configurations. No kernel work.
Acceptance: changing a parameter rebuilds every step that uses it; a configuration switch rebuilds and the mass
properties differ; an undefined parameter is refused by name.

### Batch 6 — the surfaces that need new kernel wrappers

**Shipped in this batch: Filled Surface.** Surface → Filled Surface lists the body's own B-rep edges; a click in the
viewport picks the nearest one (the end points are projected through the same viewer the app draws with) and the
panel's list ticks them too. The patch is built by `BRepOffsetAPI_MakeFilling` through `R.getOC()`, its area is
measured on the returned face, and edges that are not one boundary are refused by the kernel with its own message.
Kernel test `tests/s21g-fill.test.mjs` (four top edges of a 40 × 30 × 20 box → 1 200 mm², the body unchanged, the
one-edge refusal, the rebuild at another edge order) and browser test `tests/s21g-fill.spec.mjs` (ribbon → panel →
viewport pick → four ticks → Build → 1 200 mm² and the note, then the one-edge refusal, no page error).

<<<<<<< HEAD

Boundary Surface, Filled Surface, Trim Surface, Delete Face, and Boundary Boss/Base. This is the first batch that
adds OpenCascade bindings (`BRepOffsetAPI_MakeFilling`, the splitter on shells, `ShapeFix`). Each tool must report
the area/volume the kernel measures, and a trim or a delete that cannot be healed must say so instead of returning
a shell with a hole.
=======
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

**Also shipped in this batch: Delete Face.** Surface → Delete Face lists every face of the body; a viewport click
picks the face whose centre is under the pointer and the list stays for faces that overlap on screen. The picked
face leaves the body, and the kernel closes the opening it leaves with a patch built from that opening's own boundary
(`BRepOffsetAPI_MakeFilling`); the remaining faces and the patch are sewn into one shell (`BRepBuilderAPI_Sewing`) and
made a solid again (`BRepBuilderAPI_MakeSolid`). The step is only written when the result passes `BRepCheck_Analyzer`
and has a positive volume, and it records the removed area, the patch area and the volume before and after, all
measured. A face with more than one boundary loop is refused by name, because patching only the outer loop would
cover the opening inside it; a boundary the kernel cannot fill is refused with the kernel's own failure and nothing is
deleted. Kernel test `tests/s21j-delface.test.mjs` (the top face of a 40 × 30 × 20 box → 1 200 mm² removed and
1 200 mm² patched, 24 000 mm³ before and after, six faces, valid; replay with and without the step; the wrong-face,
no-body, two-loop and unfillable-barrel refusals) and browser test `tests/s21j-delface.spec.mjs` (ribbon → box →
panel list of six faces → viewport pick of the top face → Delete → the step and the note, no page error).

**What this batch does not do:** Delete Face is delete *and patch*, not a redefinition of the solid. There is no
`ShapeFix_Shape` and no `BRepTools_ReShape` in the bundle, so neighbour faces are not extended or re-intersected;
the gap is closed with a patch on its own boundary. For a planar face that patch lies in the same plane as the face
that was removed, so the healed body comes back at the same volume — the step says so with both numbers instead of
pretending the solid changed.

**Also shipped in this batch: Boundary Boss/Base.** Features → Boundary Boss/Base opens the same two-direction panel
as Boundary Surface (one list of the body's curves, a switch for the direction a click adds to) with a thickness
field. The patch is the boundary's, checked the same way — the first direction is lofted, the second must land on that
loft — and then it is made a solid: the kernel offsets the patch by the thickness (`BRepOffsetAPI_MakeOffsetShape`),
a wall is lofted from every boundary curve of the patch to the matching curve of the offset
(`BRepOffsetAPI_ThruSections`), and patch, offset and walls are sewn into one shell (`BRepBuilderAPI_Sewing`) and
made a solid (`BRepBuilderAPI_MakeSolid`). Both thickness directions are built and the one that adds material is the
one fused into the body, chosen by the kernel's own volumes rather than by a guess at a normal. A closed patch (the
barrel of a cylinder) carries a seam curve that sits on the face twice, so a wall there would be sewn onto an
interior edge; that wall is left out and the shell closes on its two end walls instead — only if the kernel then
accepts the solid. Kernel test `tests/s21k-boundboss.test.mjs` (the four top edges of a 40 × 30 × 20 box → 1 200 mm²
patch, 3 mm → 3 600 mm³ added and 27 600 mm³ from 24 000 mm³; a Ø40 × 30 cylinder's two circles plus its seam →
2π·20·30 = 3 769.9 mm² patch, 2 mm → π·22²·30 = 45 615.9 mm³ and 7 916.8 mm³ added; the 0 mm thickness, no-body and
one-curve refusals; the rebuild twice) and browser test `tests/s21k-boundboss.spec.mjs` (ribbon → box → panel list →
tick both directions → 3 mm → Build boss → 27 600 mm³, viewport pick into the open direction, the one-curve refusal,
no page error).

**Batch 6 status: closed, all five kernel tools shipped.** Filled Surface, Trim Surface, Boundary Surface, Delete Face
and Boundary Boss/Base are `on` (PRs #51–#55, stacked, none merged yet). Everything the batch set out to measure is
measured and written into the steps: the filled area, the kept area of a trim, both direction areas of a boundary, for
Delete Face the removed area, the patch area and the volume before and after, and for Boundary Boss/Base the volume
of material the thickness added, with the kernel's own `BRepCheck_Analyzer` verdict on the results.


Boundary Surface, Filled Surface, Trim Surface, Delete Face and Boundary Boss/Base. This is the first batch that
writes OpenCascade bindings. Each tool must report the area/volume the kernel measures, and a trim or a delete that
cannot be healed must say so instead of returning a shell with a hole.

**Measured, not assumed (probe of `R.getOC()` in the bundled kernel):** the raw OpenCascade module already exposes
`BRepOffsetAPI_MakeFilling`, `BRepAlgoAPI_Splitter`, `BRepAlgoAPI_Section`, `BRepFilletAPI_MakeFillet`,
`BRepFilletAPI_MakeChamfer`, `BRepOffsetAPI_MakeThickSolid`, `BRepAdaptor_Surface`, `TopExp_Explorer`,
`BRepBuilderAPI_MakeFace/MakeWire/MakeSolid/MakeSewing/Transform`, `BRepCheck_Analyzer`,
`BRepExtrema_DistShapeShape`, the three fixers `ShapeFix_Face/Wire/Solid`, `ShapeUpgrade_UnifySameDomain`,
`BRepTools.OuterWire` and `BRepBuilderAPI_Sewing`, so the JS wrapper is what is missing, not the binding. Not in this
build: `BRepLProp_SLProps`, `GeomLProp_SLProps`, `BRepProj_Projection`, `ShapeFix_Shape` (the master healer),
`BRepTools_ReShape` (the face-substitution/removal map), `ShapeAnalysis_FreeBounds` (which would hand back the gap's
free boundary loops), `BRep_Builder`, `TopExp` (only `TopExp_Explorer` is exported) and `GCPnts_QuasiUniformDeflection`.

That changes two things in this backlog: Boundary/Filled Surface (batch 6) and Variable Fillet (batch 7) can be
written against `R.getOC()` without a new WASM build, and Curvature/Zebra (batch 11) has to measure curvature from
`BRepAdaptor_Surface` (its `D2`/`DN` derivatives) instead of the missing `LProp` classes, or wait for a kernel
rebuild. Every tool still has to pass the same five rules at the top of this document.
>>>>>>> 4995cc5 (Boundary Boss/Base thickens the two-direction patch into a solid the kernel measures)

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
<<<<<<< HEAD
| surface filling / boundary | no | Filled Surface, Boundary Surface, Boundary Boss |
| trim/split on shells | no | Trim Surface, Split |
| heal / remove face | no | Delete Face |
=======
| surface filling / boundary | `BRepOffsetAPI_MakeFilling` (used by Filled Surface) and `BRepOffsetAPI_ThruSections` on curves as wires (used by Boundary Surface, which checks the second direction with `BRepExtrema_DistShapeShape`); Boundary Boss/Base adds `BRepOffsetAPI_MakeOffsetShape` for the thickness and walls, `BRepBuilderAPI_Sewing` and `BRepBuilderAPI_MakeSolid`; no true network/Gordon surface | — |
| trim/split on shells | `BRepAlgoAPI_Splitter` on a face (used by Trim Surface); not on a shell with another shell | Split |
| heal / remove face | no `ShapeFix_Shape` (the master healer) and no `BRepTools_ReShape`; `ShapeFix_Face`, `ShapeFix_Wire`, `ShapeFix_Solid`, `ShapeUpgrade_UnifySameDomain`, `TopExp_Explorer`, `BRepCheck_Analyzer` and `BRepTools.OuterWire` are exported, and Delete Face patches the opening with `BRepOffsetAPI_MakeFilling` + `BRepBuilderAPI_Sewing` instead of extending neighbours; `BRepOffsetAPI_MakeThickSolid` is exported but it will not thicken an open patch (it returns a single face of zero volume), which is why Boundary Boss/Base offsets the patch and lofts its own walls | — |
>>>>>>> 4995cc5 (Boundary Boss/Base thickens the two-direction patch into a solid the kernel measures)
| projection of a sketch onto a face | no | Wrap/Emboss, Text |
| curvature at a point on a face | no | Curvature / Zebra |
| cope on a hollow section | no | Weldments Trim/Extend |
| fold model with material on one side | no (sector model) | Hem, Jog |
| named plane / axis as a sketch host | no (strings + offset) | Reference Plane/Axis, Curve/Fill Pattern |
| multi-body part | no (one `body`) | Split, Delete Face on one body |
| parameter table + expressions | no | Parameters, Configurations |
| kinematic solver with time | no (mates are measured) | Motion Study |
