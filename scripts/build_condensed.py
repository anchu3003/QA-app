import json
import os
import sys

MERGES = [
    [1, 358],
    [5, 775],
    [65, 307],
    [102, 779],
    [164, 689],
    [177, 213, 926, 1018],
    [186, 445],
    [202, 880],
    [204, 479],
    [218, 623],
    [220, 737],
    [253, 337],
    [262, 834],
    [281, 631],
    [301, 709],
    [320, 985],
    [372, 691],
    [422, 762],
    [434, 957],
    [562, 881],
    [581, 608],
    [738, 800],
    [789, 795],
    [853, 910],
]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "quiz-new.json")
out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "quiz-new-2.json")

with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

by_id = {q["id"]: q for q in data}

remove_ids = set()
for cluster in MERGES:
    rep_id, *others = cluster
    rep = by_id[rep_id]
    note = f"\n\nSimilar questions (merged during review-set condensing, same core concept): {', '.join('#' + str(o) for o in others)}."
    rep["explanation"] = rep["explanation"].rstrip() + note
    remove_ids.update(others)

condensed = [q for q in data if q["id"] not in remove_ids]

for q in condensed:
    q.pop("_q_tokens", None)
    q.pop("_a_tokens", None)
    q.pop("_combined", None)
    q.pop("_tok", None)
    q.pop("_qtok", None)

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(condensed, f, indent=2, ensure_ascii=False)

print(f"Original: {len(data)}  Condensed: {len(condensed)}  Removed: {len(remove_ids)}  Merged clusters: {len(MERGES)}")
