#!/usr/bin/env python3
"""Duplicate scan for an exam pack (ADDING_AN_EXAM.md, step 6).

Compares every pair of items in the same section and reports the ones that
are too alike. Two measures, both Jaccard similarity over word 3-shingles
weighted by rarity (wording shared by many items, like "what is the value of
x", counts for little):

  same   the texts as written (numbers kept): a high score means the same
         question, or the same passage, twice. With the same answer, 0.4 is
         already a duplicate (a reworded copy); 0.5 alone is a near-copy.
  shape  numbers folded to "#": a high score means the same template with
         different numbers. Fine in moderation for drills; a batch of them
         reads as padding, and a pair with the same answer is a duplicate.

What is compared: Math items by stem, table, figure elements and choices;
passage items (a section with passage rules) by passage, paired passage and
choices, because their stems are boilerplate shared by hundreds of items.

Usage: python3 -I scripts/scan_duplicates.py exams/sat [--same 0.5] [--shape 0.8]
       [--top N] [--json out.json] [--allow exams/sat/reports/duplicates-allowed.json]

Exit 1 for a duplicate (same answer, and same ≥ 0.4 or shape ≥ 0.8) or a
near-copy (same ≥ 0.5 as written), unless the pair is in the allow file with
a reason. Pairs that only share a template, and passages that share a subject
(same ≥ 0.15 in a passage section), are listed for review.
Standard library only.
"""
import argparse
import collections
import glob
import itertools
import json
import math
import os
import re
import sys

WORD = re.compile(r"[a-z0-9#]+")
NUM = re.compile(r"\d+(?:[.,]\d+)?")
K = 3  # shingle length in words
COMMON = 40  # a shingle shared by more items than this says nothing (boilerplate)


def tokens(text, fold):
    t = text.lower().replace("−", "-")
    t = re.sub(r"<[^>]+>", " ", t)
    if fold:
        t = NUM.sub("#", t)
    return WORD.findall(t)


def shingles(toks):
    if len(toks) < K:
        return {tuple(toks)} if toks else set()
    return {tuple(toks[i:i + K]) for i in range(len(toks) - K + 1)}


def jaccard(a, b):
    if not a or not b:
        return 0.0
    i = len(a & b)
    return i / (len(a) + len(b) - i)


def table_text(t):
    if not t:
        return ""
    parts = [t.get("title") or ""] + [str(h) for h in t.get("headers", [])]
    for r in t.get("rows", []):
        parts += [str(c) for c in r]
    return " ".join(parts)


def figure_text(f):
    """Each element as its type, its numbers and its labels, in a fixed order."""
    if not f:
        return ""
    def flat(v):
        if isinstance(v, (list, tuple)):
            return " ".join(flat(x) for x in v)
        if isinstance(v, dict):
            return " ".join(flat(v[k]) for k in sorted(v))
        return str(v)
    out = []
    for e in f.get("elements", []):
        rest = {k: v for k, v in e.items() if k != "type"}
        out.append(f"{e.get('type', '')} {flat(rest)}")
    return "\n".join(out)


def item_text(it, passage_based):
    if passage_based:
        parts = [it.get("passage") or "", it.get("passage2") or "", table_text(it.get("table"))] + list(it.get("choices") or [])
    else:
        parts = [it["stem"], table_text(it.get("table")), figure_text(it.get("figure"))] + list(it.get("choices") or [])
    return "\n".join(p for p in parts if p)


def load_pack(root):
    exam = json.load(open(os.path.join(root, "exam.json")))
    skills = json.load(open(os.path.join(root, "skills.json")))
    sec_of, passage_sections = {}, set()
    for s in skills["sections"]:
        for d in s["domains"]:
            for sk in d["skills"]:
                sec_of[sk["id"]] = s["id"]
    for s in exam["sections"]:
        if s.get("passage", {}).get("required"):
            passage_sections.add(s["id"])
    items = []
    for p in sorted(glob.glob(os.path.join(root, "items", "*.json"))):
        for it in json.load(open(p)):
            if isinstance(it, dict) and "id" in it:
                items.append(it)
    return exam, sec_of, passage_sections, items


def pairs_for(items, fold):
    """All pairs sharing at least two uncommon shingles, scored by weighted Jaccard:
    each shingle weighs log(N / df), so wording shared by many items counts for little."""
    sh = [shingles(tokens(t, fold)) for t in items]
    index = collections.defaultdict(list)
    for i, s in enumerate(sh):
        for g in s:
            index[g].append(i)
    n = max(len(items), 2)
    weight = {g: math.log(n / len(idxs)) for g, idxs in index.items()}
    shared = collections.Counter()
    for g, idxs in index.items():
        if len(idxs) > COMMON or len(idxs) < 2:
            continue
        for a, b in itertools.combinations(idxs, 2):
            shared[(a, b)] += 1
    def wj(a, b):
        inter = sum(weight[g] for g in sh[a] & sh[b])
        union = sum(weight[g] for g in sh[a] | sh[b])
        return inter / union if union else 0.0
    return {(a, b): wj(a, b) for (a, b), c in shared.items() if c >= 2}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pack")
    ap.add_argument("--same", type=float, default=0.5, help="threshold on the as-written score")
    ap.add_argument("--shape", type=float, default=0.8, help="threshold on the numbers-folded score")
    ap.add_argument("--topic", type=float, default=0.15, help="passage sections: two passages this alike share a subject")
    ap.add_argument("--top", type=int, default=0, help="also list the N highest pairs under the thresholds")
    ap.add_argument("--section", help="only this section id")
    ap.add_argument("--json", help="write every pair scoring at least --floor here")
    ap.add_argument("--floor", type=float, default=0.1, help="lowest score kept in --json")
    ap.add_argument("--allow", help="JSON file of reviewed pairs to accept: [{\"ids\": [a, b], \"reason\": …}]")
    args = ap.parse_args()

    exam, sec_of, passage_sections, items = load_pack(args.pack)
    allowed = {}
    if args.allow and os.path.exists(args.allow):
        for e in json.load(open(args.allow)).get("pairs", []):
            allowed[tuple(sorted(e["ids"]))] = e.get("reason", "")

    by_section = collections.defaultdict(list)
    for it in items:
        by_section[sec_of.get(it["skill_id"], "?")].append(it)

    findings = []
    for sec, its in sorted(by_section.items()):
        if args.section and sec != args.section:
            continue
        pb = sec in passage_sections
        texts = [item_text(it, pb) for it in its]
        same = pairs_for(texts, fold=False)
        shape = pairs_for(texts, fold=True)
        for key in set(same) | set(shape):
            a, b = key
            s_same, s_shape = same.get(key, 0.0), shape.get(key, 0.0)
            ia, ib = its[a], its[b]
            same_answer = str(ia.get("answer")).strip().lower() == str(ib.get("answer")).strip().lower()
            # duplicate: the same question twice (same answer; as written, or the same
            # template). near-copy: almost the same text asking for something else.
            # template: the same shape with different numbers and answers (review only).
            if same_answer and (s_same >= args.same * 0.8 or s_shape >= args.shape):
                kind = "duplicate"
            elif s_same >= args.same:
                kind = "near-copy"
            elif s_shape >= args.shape:
                kind = "template"
            elif pb and s_same >= args.topic:
                # Passages on the same subject with the same opening, in different skills.
                kind = "topic"
            else:
                kind = ""
            findings.append({
                "section": sec, "ids": sorted([ia["id"], ib["id"]]), "same": round(s_same, 3), "shape": round(s_shape, 3),
                "same_answer": same_answer, "kind": kind,
                "skills": sorted({ia["skill_id"], ib["skill_id"]}),
            })

    rank = {"duplicate": 0, "near-copy": 1, "template": 2, "topic": 3, "": 4}
    findings.sort(key=lambda f: (rank[f["kind"]], -max(f["same"], f["shape"]), f["ids"]))
    blocking = [f for f in findings if f["kind"] in ("duplicate", "near-copy") and tuple(f["ids"]) not in allowed]
    review = [f for f in findings if f["kind"] == "template" and tuple(f["ids"]) not in allowed]
    topics = [f for f in findings if f["kind"] == "topic" and tuple(f["ids"]) not in allowed]
    accepted = [f for f in findings if f["kind"] and tuple(f["ids"]) in allowed]

    by_id = {it["id"]: it for it in items}
    def show(f):
        a, b = f["ids"]
        print(f"  {a} ~ {b}  same {f['same']:.2f}  shape {f['shape']:.2f}  answers {'equal' if f['same_answer'] else 'differ'}  [{f['kind']}]")
        for i in (a, b):
            it = by_id[i]
            head = (it.get("passage") or it["stem"]).replace("\n", " ")
            print(f"      {i}: {head[:150]}{'…' if len(head) > 150 else ''}")

    print(f"{len(items)} items in {len(by_section)} sections; {len(findings)} pairs share wording")
    if blocking:
        print(f"\n{len(blocking)} pair(s) too alike (the same answer with same ≥ {args.same * 0.8:.2f} or shape ≥ {args.shape}, or same ≥ {args.same} as written):")
        for f in blocking:
            show(f)
    if review:
        print(f"\n{len(review)} pair(s) share a template with different answers (shape ≥ {args.shape}); worth a look, not blocking:")
        for f in review[:50]:
            show(f)
        if len(review) > 50:
            print(f"  … and {len(review) - 50} more (use --json)")
    if topics:
        print(f"\n{len(topics)} passage pair(s) share a subject and an opening (same ≥ {args.topic}); spread the topics when rewriting:")
        for f in topics[:40]:
            show(f)
        if len(topics) > 40:
            print(f"  … and {len(topics) - 40} more (use --json)")
    if accepted:
        print(f"\n{len(accepted)} pair(s) reviewed and allowed in {args.allow}")
    if args.top:
        rest = [f for f in findings if not f["kind"]][: args.top]
        print(f"\nNext {len(rest)} pairs under the thresholds:")
        for f in rest:
            show(f)
    if args.json:
        keep = [f for f in findings if f["same"] >= args.floor or f["shape"] >= args.floor]
        json.dump({"pack": exam["id"], "thresholds": {"same": args.same, "shape": args.shape}, "pairs": keep}, open(args.json, "w"), indent=1, ensure_ascii=False)
        print(f"\nwrote {len(keep)} pairs to {args.json}")
    return 1 if blocking else 0


if __name__ == "__main__":
    sys.exit(main())
