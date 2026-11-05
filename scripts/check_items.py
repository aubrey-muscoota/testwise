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
