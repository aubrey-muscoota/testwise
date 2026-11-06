"""Validate item files: schema, and that each item's `check` code reproduces its answer.

Usage: python3 -I scripts/check_items.py content/items/*.json
Exits non-zero if any item fails. Prints one line per failure.
"""
import json, sys, subprocess, re
from fractions import Fraction

REQ = ["id", "skill_id", "difficulty", "type", "stem", "answer", "explanation", "hints"]

def to_num(s):
    s = str(s).strip().replace("−", "-").replace(",", "")
    s = re.sub(r"^\$", "", s).rstrip("%°")
    try:
        return Fraction(s)
    except Exception:
        pass
    try:
        return Fraction(float(s)).limit_denominator(10**6)
    except Exception:
        return None


FIG_TYPES = {
    "point": ["at"], "segment": ["from", "to"], "line": ["through"], "ray": ["from", "through"],
    "polygon": ["points"], "circle": ["center", "r"], "arc": ["center", "r", "start", "end"],
    "angle": ["vertex", "from", "to"], "function": ["expr", "domain"], "scatter": ["points"],
    "text": ["at", "text"], "tick": ["on"],
}
FUNCS = {"sqrt", "abs", "exp", "ln", "log", "sin", "cos", "tan", "pi", "e", "x"}

def is_pt(v):
    return isinstance(v, list) and len(v) == 2 and all(isinstance(n, (int, float)) for n in v)

def eval_expr(expr, xv):
    """Evaluate a figure expression the way the app does (see app/src/figure/expr.ts)."""
    import math
    words = set(re.findall(r"[A-Za-z]+", expr))
    if not words <= FUNCS:
        raise ValueError(f"unknown names {sorted(words - FUNCS)}")
    if re.search(r"[^0-9A-Za-z+\-*/^(). ]", expr):
        raise ValueError("bad characters")
    py = expr.replace("^", "**")
    env = {"sqrt": math.sqrt, "abs": abs, "exp": math.exp, "ln": math.log, "log": math.log10,
           "sin": math.sin, "cos": math.cos, "tan": math.tan, "pi": math.pi, "e": math.e, "x": xv}
    return eval(py, {"__builtins__": {}}, env)

def check_figure(fig):
    """Returns a list of problems with a figure spec (empty = fine)."""
    errs = []
    if not isinstance(fig, dict):
        return ["figure must be an object"]
    if not str(fig.get("alt", "")).strip() or len(fig["alt"]) < 20:
        errs.append("figure needs alt text (20+ chars)")
    pl = fig.get("plane")
    if not (isinstance(pl, dict) and isinstance(pl.get("x"), list) and isinstance(pl.get("y"), list)
            and len(pl["x"]) == 2 and len(pl["y"]) == 2 and pl["x"][0] < pl["x"][1] and pl["y"][0] < pl["y"][1]):
        errs.append("figure.plane needs x and y ranges [min, max]")
        return errs
    els = fig.get("elements")
    if not isinstance(els, list) or not els:
        return errs + ["figure.elements must be a non-empty list"]
    for i, el in enumerate(els):
        t = el.get("type") if isinstance(el, dict) else None
        if t not in FIG_TYPES:
            errs.append(f"element {i}: unknown type {t}"); continue
        miss = [k for k in FIG_TYPES[t] if k not in el]
        if miss:
            errs.append(f"element {i} ({t}): missing {miss}"); continue
        for k in ("at", "from", "to", "center", "vertex"):
            if k in el and not is_pt(el[k]):
                errs.append(f"element {i} ({t}): {k} must be [x, y]")
        if t in ("line", "ray") and t == "line" and not (isinstance(el["through"], list) and len(el["through"]) == 2 and all(is_pt(p) for p in el["through"])):
            errs.append(f"element {i} (line): through must be two points")
        if t == "ray" and not is_pt(el["through"]):
            errs.append(f"element {i} (ray): through must be [x, y]")
        if t in ("polygon", "scatter") and not (isinstance(el["points"], list) and all(is_pt(p) for p in el["points"])):
            errs.append(f"element {i} ({t}): points must be [x, y] pairs")
        if t == "polygon":
            n = len(el["points"])
            for k in ("vertexLabels", "sideLabels"):
                if k in el and len(el[k]) != n:
                    errs.append(f"element {i} (polygon): {k} needs {n} entries")
        if t == "tick" and not (isinstance(el["on"], list) and len(el["on"]) == 2 and all(is_pt(p) for p in el["on"])):
            errs.append(f"element {i} (tick): on must be two points")
        if t == "function":
            d = el["domain"]
            try:
                for k in range(11):
                    xv = d[0] + (d[1] - d[0]) * k / 10
                    try:
                        eval_expr(el["expr"], xv)
                    except (ZeroDivisionError, ValueError, OverflowError) as ex:
                        if "unknown names" in str(ex) or "bad characters" in str(ex):
                            raise
            except Exception as ex:
                errs.append(f"element {i} (function): {ex}")
    return errs

RW_PREFIX = "rw-"

def check_rw(it):
    errs = []
    p = it.get("passage")
    if not isinstance(p, str) or not p.strip():
        return ["reading/writing item needs a passage"]
    words = len(re.sub(r"<\/?u>", "", p).split())
    limit = 110 if it.get("passage2") else 150
    if words < 20 or words > limit + 15:
        errs.append(f"passage has {words} words (want 25-{limit})")
    if it.get("passage2") is not None:
        w2 = len(it["passage2"].split())
        if w2 < 20 or w2 > 125:
            errs.append(f"passage2 has {w2} words (want 25-110)")
    if re.search(r"<(?!/?u>)", p):
        errs.append("only <u>…</u> markup is allowed")
    if p.count("<u>") != p.count("</u>"):
        errs.append("unbalanced <u> tags")
    if it["type"] != "mc":
        errs.append("reading/writing items are mc")
    if it.get("check"):
        errs.append("reading/writing items have check: null")
    wr = it.get("wrong_reasons") or {}
    wrong = [c for c in it.get("choices") or [] if c != it["answer"]]
    if set(wr) != set(wrong):
        errs.append("wrong_reasons must cover exactly the 3 wrong choices")
    return errs

def run_check(code):
    prog = code + "\nfrom sympy import nsimplify as _ns\ntry:\n    print(repr(float(_ns(result))))\nexcept Exception:\n    print('STR:'+str(result))\n"
    r = subprocess.run([sys.executable, "-I", "-c", prog], capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        return None, r.stderr.strip().splitlines()[-1] if r.stderr else "error"
    return r.stdout.strip().splitlines()[-1], None

def same(expected, got):
    if got.startswith("STR:"):
        g = got[4:].strip().replace(" ", "")
        return g == str(expected).replace(" ", "").replace("−", "-")
    e = to_num(expected)
    if e is None:
        return False
    return abs(float(e) - float(got)) < 1e-6 * max(1, abs(float(e)))

def main(paths):
    fails, total, checked = 0, 0, 0
    ids = set()
    for p in paths:
        items = json.load(open(p))
        for it in items:
            total += 1
            iid = it.get("id", "?")
            miss = [k for k in REQ if k not in it]
            if miss:
                print(f"FAIL {iid}: missing {miss}"); fails += 1; continue
            if iid in ids:
                print(f"FAIL {iid}: duplicate id"); fails += 1
            ids.add(iid)
            if it["type"] == "mc":
                ch = it.get("choices") or []
                if len(ch) != 4 or it["answer"] not in ch or len(set(ch)) != 4:
                    print(f"FAIL {iid}: mc needs 4 distinct choices containing the answer"); fails += 1; continue
            elif it["type"] != "spr":
                print(f"FAIL {iid}: bad type"); fails += 1; continue
            extra = []
            if "figure" in it:
                extra += check_figure(it["figure"])
            if str(it.get("skill_id", "")).startswith(RW_PREFIX):
                extra += check_rw(it)
            if extra:
                print(f"FAIL {iid}: " + "; ".join(extra)); fails += 1; continue
            if it.get("check"):
                got, err = run_check(it["check"])
                checked += 1
                if err:
                    print(f"FAIL {iid}: check error: {err}"); fails += 1
                elif not same(it["answer"], got):
                    print(f"FAIL {iid}: check gave {got}, key is {it['answer']}"); fails += 1
    print(f"{total} items, {checked} code-checked, {fails} failures")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
