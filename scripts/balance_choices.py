"""Spread multiple-choice answers evenly across the answer letters (A–D for 4 choices).

Writers tend to put the right answer first. This script reorders choices:
- all-numeric choices are sorted ascending (the usual convention on standardized tests), and
- other choices get the answer moved to the least-used letter so far in the file,
  keeping the wrong choices in their original order.
Items whose choices refer to each other ("Both", "I and II", ...) are left alone.
Any item whose `check` fails after reordering is restored.

Usage: python3 -I scripts/balance_choices.py exams/<id>/items/*.json
"""
import json, os, re, sys, subprocess, copy, collections
from fractions import Fraction

LETTERS = "ABCDEFGH"
FIXED = re.compile(r"\b(both|neither|none of|all of the|I and II|I only|II only|III)\b", re.I)

def num(s):
    t = str(s).strip().replace("−", "-").replace(",", "").lstrip("$").rstrip("%°")
    t = re.sub(r"\s*(cm|m|in|ft|units?|square .*|cubic .*|degrees|minutes|hours|dollars|mL|L)$", "", t)
    try:
        return float(Fraction(t))
    except Exception:
        try:
            return float(t)
        except Exception:
            return None

def check_ok(item, path):
    code = item.get("check")
    if not code:
        return True
    pack = os.path.dirname(os.path.dirname(os.path.abspath(path)))
    r = subprocess.run([sys.executable, "-I", "scripts/check_items.py", "--pack", pack, "/dev/stdin"], input=json.dumps([item]),
                       capture_output=True, text=True)
    return r.returncode == 0

def main(paths):
    total = collections.Counter()
    for p in paths:
        items = json.load(open(p))
        used = collections.Counter()
        for it in items:
            if it["type"] != "mc":
                continue
            ch = it["choices"]
            before = copy.deepcopy(it)
            if any(FIXED.search(c) for c in ch):
                pass
            elif all(num(c) is not None for c in ch):
                it["choices"] = sorted(ch, key=num)
            else:
                others = [c for c in ch if c != it["answer"]]
                target = min(range(len(ch)), key=lambda i: (used[i], (hash(it["id"]) >> i) & 1, i))
                others.insert(target, it["answer"])
                it["choices"] = others
            if it["choices"] != before["choices"] and not check_ok(it, p):
                it["choices"] = before["choices"]
                print(f"kept order (check depends on it): {it['id']}")
            used[it["choices"].index(it["answer"])] += 1
        json.dump(items, open(p, "w"), indent=2, ensure_ascii=False)
        open(p, "a").write("\n")
        total += used
        print(p.split("/")[-1], {LETTERS[k]: v for k, v in sorted(used.items())})
    print("TOTAL", {LETTERS[k]: v for k, v in sorted(total.items())})

if __name__ == "__main__":
    main(sys.argv[1:])
