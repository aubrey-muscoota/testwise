// A tiny, safe evaluator for figure function expressions, e.g. "2*x^2 - 3*x + 1".
// Same grammar and precedence as Python (which scripts/check_items.py uses to
// validate them): ^ is power and binds tighter than unary minus (-x^2 = -(x^2)),
// and is right-associative.

type Node = (x: number) => number;

const FUNCS: Record<string, (v: number) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function compile(src: string): Node {
  const toks = src.match(/\d+\.?\d*|\.\d+|[A-Za-z]+|\*\*|[-+*/^()]/g) ?? [];
  if (toks.join("") !== src.replace(/\s+/g, "")) throw new Error(`bad expression: ${src}`);
  let i = 0;
  const peek = () => toks[i];
  const eat = (t?: string) => {
    const v = toks[i++];
    if (t && v !== t) throw new Error(`expected ${t} in ${src}`);
    return v;
  };

  // expr := term (('+'|'-') term)*
  function expr(): Node {
    let left = term();
    while (peek() === "+" || peek() === "-") {
      const op = eat();
      const a = left, b = term();
      left = op === "+" ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return left;
  }
  // term := unary (('*'|'/') unary)*
  function term(): Node {
    let left = unary();
    while (peek() === "*" || peek() === "/") {
      const op = eat();
      const a = left, b = unary();
      left = op === "*" ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
    }
    return left;
  }
  // unary := ('-'|'+') unary | power
  function unary(): Node {
    if (peek() === "-") { eat(); const a = unary(); return (x) => -a(x); }
    if (peek() === "+") { eat(); return unary(); }
    return power();
  }
  // power := atom ('^' unary)?
  function power(): Node {
    const base = atom();
    if (peek() === "^" || peek() === "**") {
      eat();
      const ex = unary();
      return (x) => Math.pow(base(x), ex(x));
    }
    return base;
  }
  function atom(): Node {
    const t = eat();
    if (t === undefined) throw new Error(`unexpected end of ${src}`);
    if (t === "(") { const e = expr(); eat(")"); return e; }
    if (/^[\d.]/.test(t)) { const v = Number(t); return () => v; }
    if (t === "x") return (x) => x;
    if (t in CONSTS) { const v = CONSTS[t]; return () => v; }
    if (t in FUNCS) { const f = FUNCS[t]; eat("("); const a = expr(); eat(")"); return (x) => f(a(x)); }
    throw new Error(`unknown name ${t} in ${src}`);
  }

  const node = expr();
  if (i !== toks.length) throw new Error(`trailing input in ${src}`);
  return node;
}
