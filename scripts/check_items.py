"""Validate item files: schema, and that each item's `check` code reproduces its answer.

Usage: python3 -I scripts/check_items.py exams/*/items/*.json
Exam-specific rules (item types, choice count, code checks, passage limits)
come from the pack that holds each file: exams/<id>/exam.json and skills.json.
Exits non-zero if any item fails. Prints one line per failure.
"""
import json, os, sys, subprocess, re
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

def uncomment(v):
    """Drops "//" comment keys, as scripts/lib/packs.mjs does."""
    if isinstance(v, dict):
        return {k: uncomment(x) for k, x in v.items() if not k.startswith("//")}
    if isinstance(v, list):
        return [uncomment(x) for x in v]
    return v

# Used when an item file isn't inside an exam pack.
DEFAULT_SECTION = {"id": "?", "item_types": ["mc", "spr"], "choices": 4, "code_checks": True}
_packs = {}

PACK_OVERRIDE = None  # --pack <dir>: use this pack for every file (e.g. items piped on stdin)

def section_rules(item_path):
    """{skill_id: section config from exam.json} for the pack holding this item file."""
    pack = PACK_OVERRIDE or os.path.dirname(os.path.dirname(os.path.abspath(item_path)))
    if pack not in _packs:
        rules = {}
        try:
            exam = uncomment(json.load(open(os.path.join(pack, "exam.json"))))
            skills = uncomment(json.load(open(os.path.join(pack, "skills.json"))))
            secs = {s["id"]: s for s in exam.get("sections", [])}
            for sec in skills.get("sections", []):
                for d in sec.get("domains", []):
                    for sk in d.get("skills", []):
                        rules[sk["id"]] = secs.get(sec["id"], DEFAULT_SECTION)
        except (OSError, ValueError, KeyError):
            pass
        _packs[pack] = rules
    return _packs[pack]

def check_passage(it, rules):
    """Passage rules for sections whose exam.json sets "passage": {"required": true, ...}."""
    errs = []
    p = it.get("passage")
    if not isinstance(p, str) or not p.strip():
        return ["items in this section need a passage"]
    lo, hi, paired = rules.get("min_words", 20), rules.get("max_words", 165), rules.get("paired_max_words", 125)
    words = len(re.sub(r"<\/?u>", "", p).split())
    limit = paired if it.get("passage2") else hi
    if words < lo or words > limit:
        errs.append(f"passage has {words} words (want {lo}-{limit})")
    if it.get("passage2") is not None:
        w2 = len(it["passage2"].split())
        if w2 < lo or w2 > paired:
            errs.append(f"passage2 has {w2} words (want {lo}-{paired})")
    if re.search(r"<(?!/?u>)", p):
        errs.append("only <u>…</u> markup is allowed")
    if p.count("<u>") != p.count("</u>"):
        errs.append("unbalanced <u> tags")
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
            sec = section_rules(p).get(it.get("skill_id")) or DEFAULT_SECTION
            if it["type"] not in ("mc", "spr"):
                print(f"FAIL {iid}: bad type"); fails += 1; continue
            if it["type"] not in sec.get("item_types", ["mc", "spr"]):
                print(f"FAIL {iid}: type {it['type']} is not allowed in section {sec['id']}"); fails += 1; continue
            if it["type"] == "mc":
                n = sec.get("choices", 4)
                ch = it.get("choices") or []
                if len(ch) != n or it["answer"] not in ch or len(set(ch)) != n:
                    print(f"FAIL {iid}: mc needs {n} distinct choices containing the answer"); fails += 1; continue
            extra = []
            if "figure" in it:
                extra += check_figure(it["figure"])
            if (sec.get("passage") or {}).get("required"):
                extra += check_passage(it, sec["passage"])
            if not sec.get("code_checks", True) and it.get("check"):
                extra.append(f"items in section {sec['id']} have check: null")
            if it["type"] == "mc":
                wr = it.get("wrong_reasons") or {}
                if set(wr) != set(c for c in it["choices"] if c != it["answer"]):
                    extra.append("wrong_reasons must cover exactly the wrong choices")
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
    args = sys.argv[1:]
    if args[:1] == ["--pack"]:
        PACK_OVERRIDE, args = os.path.abspath(args[1]), args[2:]
    sys.exit(main(args))
