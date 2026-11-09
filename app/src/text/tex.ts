// Turns a small TeX subset inside $…$ into readable Unicode text, so items can be
// written in TeX and still render as plain text on every platform.
// Supported: \frac{a}{b}, \sqrt{x}, ^{…} and ^x, _{…} and _x, \le \ge \ne \pm \times
// \cdot \div \pi \theta \alpha \beta \infty \degree \circ \angle \triangle \overline{AB}, \left( \right).

const SUP: Record<string, string> = { "°": "°", "′": "′", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", x: "ˣ", i: "ⁱ", a: "ᵃ", b: "ᵇ", k: "ᵏ", t: "ᵗ", m: "ᵐ" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", n: "ₙ", x: "ₓ", a: "ₐ", e: "ₑ", o: "ₒ", i: "ᵢ", k: "ₖ", m: "ₘ", t: "ₜ" };
const SYM: Record<string, string> = {
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", pm: "±", times: "×", cdot: "·", div: "÷", pi: "π",
  theta: "θ", alpha: "α", beta: "β", infty: "∞", degree: "°", circ: "°", angle: "∠", triangle: "△", approx: "≈",
  left: "", right: "", ",": " ", ";": " ", quad: "  ", "%": "%", "$": "$",
};

function script(s: string, map: Record<string, string>, mark: string) {
  const chars = [...s];
  return chars.every((c) => map[c]) ? chars.map((c) => map[c]).join("") : `${mark}(${s})`;
}

// Reads one {group} or single character starting at i. Returns [content, next index].
function group(src: string, i: number): [string, number] {
  while (src[i] === " ") i++;
  if (src[i] === "\\") {
    const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
    const n = m ? m[0].length : 1;
    return [src.slice(i, i + n), i + n];
  }
  if (src[i] !== "{") return [src[i] ?? "", i + 1];
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return [src.slice(i + 1, j), j + 1];
  }
  return [src.slice(i + 1), src.length];
}

const simple = (s: string) => /^[\w.²³√π]+$/.test(s);

export function texToText(src: string): string {
  let out = "";
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === "\\") {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
      const name = m ? m[1] : "";
      i += name.length + 1;
      // TeX ignores spaces after a control word.
      if (/^[A-Za-z]+$/.test(name)) while (src[i] === " ") i++;
      if (name === "frac") {
        const [a, j] = group(src, i);
        const [b, k] = group(src, j);
        i = k;
        const ta = texToText(a), tb = texToText(b);
        // A mixed number ($2\frac{1}{2}$) keeps a thin space before its fraction: 2 1/2, not 21/2.
        if (/\d$/.test(out)) out += "\u2009";
        out += `${simple(ta) ? ta : `(${ta})`}/${simple(tb) ? tb : `(${tb})`}`;
      } else if (name === "sqrt") {
        const [a, j] = group(src, i);
        i = j;
        const ta = texToText(a);
        out += simple(ta) ? `√${ta}` : `√(${ta})`;
      } else if (name === "overline") {
        const [a, j] = group(src, i);
        i = j;
        out += [...texToText(a)].map((ch) => ch + "̅").join("");
      } else if (name === "text" || name === "mathrm") {
        const [a, j] = group(src, i);
        i = j;
        out += a;
      } else out += SYM[name] ?? name;
    } else if (c === "^" || c === "_") {
      const [a, j] = group(src, i + 1);
      i = j;
      const t = texToText(a);
      out += c === "^" ? script(t, SUP, "^") : script(t, SUB, "_");
    } else if (c === "{" || c === "}") {
      i++;
    } else if (c === "-") {
      out += "−";
      i++;
    } else {
      out += c;
      i++;
    }
  }
  // Non-breaking spaces around operators, so an expression never wraps mid-way.
  return out.replace(/\s*([=<>≤≥≠+±×÷])\s*/g, "\u00a0$1\u00a0").replace(/\s{2,}/g, " ").trim();
}

// A closing "$" right before a digit is the next dollar amount ("= $300"), not math.
const isTex = (t: string, after?: string) => /[\\^_{}=]/.test(t) && !/\d/.test(after ?? "");

// Replaces every $…$ span that holds TeX. A span is TeX only when it has a TeX
// signal (\ ^ _ { } =); otherwise it is a pair of dollar amounts ("$2.50 … $9.75")
// and is left untouched. A literal dollar sign can always be written \$.
export function renderMath(s: string): string {
  if (!s.includes("$")) return s;
  return s
    .replace(/\\\$/g, "\u0000")
    .replace(/\$([^$]+)\$/g, (m, t, at, all) => (isTex(t, all[at + m.length]) ? texToText(t) : m))
    .replace(/\u0000/g, "$");
}
