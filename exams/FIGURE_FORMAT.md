# Figures

An item may carry a `figure` field. The app draws it from this spec (react-native-svg), so a figure is code, not an image file. Every figure needs `alt` text that a screen-reader user could solve the question from.

```json
"figure": {
  "alt": "A coordinate plane with the line y = 2x − 1 passing through (0, −1) and (2, 3).",
  "aspect": 1,
  "plane": { "x": [-5, 5], "y": [-5, 5], "grid": 1, "axes": true, "ticks": 1, "xlabel": "x", "ylabel": "y" },
  "elements": [
    { "type": "function", "expr": "2*x - 1", "domain": [-2, 3] },
    { "type": "point", "at": [2, 3], "label": "(2, 3)" }
  ]
}
```

- `aspect`: width / height of the drawing (default 1). The app scales it to the screen.
- `plane`: the coordinate window. Everything is placed in these coordinates. `grid` and `ticks` are spacings (0 or omitted = none). `axes: false` hides the axes (use it for geometry diagrams; coordinates still place the shapes). Optional `xlabel`, `ylabel`, and `xticklabels`/`yticklabels` booleans (default true when axes are shown). Keep both ranges in proportion to `aspect` for geometry so angles look right.

Element types (all coordinates are `[x, y]` in plane units):

| type | fields |
| --- | --- |
| `point` | `at`, optional `label`, `labelPos` ("ne", "nw", "se", "sw", "n", "s", "e", "w"; default "ne"), `open` (hollow dot) |
| `segment` | `from`, `to`, optional `label` (placed at the midpoint), `dash`, `arrow` ("end", "both") |
| `line` | `through`: two points; drawn across the whole window. Optional `dash`, `label` |
| `ray` | `from`, `through`, optional `dash` |
| `polygon` | `points` (3+), optional `fill` (true for a light fill), `vertexLabels` (one per point, "" to skip), `sideLabels` (one per side, side i joins point i and i+1, "" to skip) |
| `circle` | `center`, `r`, optional `fill` |
| `arc` | `center`, `r`, `start`, `end` (degrees, counterclockwise from +x), optional `label` |
| `angle` | `vertex`, `from`, `to` (points on each ray), optional `label`, `right` (true draws a right-angle square) |
| `function` | `expr` in x using + − * / ^ ( ), numbers, `sqrt`, `abs`, `exp`, `ln`, `log` (base 10), `sin`, `cos`, `tan`, `pi`, `e`; `domain` [a, b]; optional `dash`, `label`, `labelAt` ([x, y]) |
| `scatter` | `points`: list of [x, y]; optional `hollow` |
| `text` | `at`, `text` |
| `tick` | `on`: [from, to] of a segment; `count` 1–3 congruence marks |

Rules:
- Use Unicode math in labels (x², √, π, °). No LaTeX inside figures.
- Draw "not drawn to scale" figures only when the stem says so; otherwise the drawing must be accurate to the numbers in the stem.
- The figure must agree with the stem, the answer and the check code. If a number is needed to solve the item, it must be in the stem or a label, never only implied by the drawing (except for graph-reading items, where the graph is the data: then points must sit on clear grid intersections).
- `check` code still computes the answer independently from the stated numbers.
