import os
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ids_to_check = [1,358,5,775,66,328,76,860,158,845,164,689,177,213,926,1018,
                 202,880,204,479,211,732,215,951,220,737,253,337,262,834,
                 281,631,301,709,422,762,434,957,738,800,789,795]

path = os.path.join(ROOT, "quiz-new.json")
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

by_id = {q["id"]: q for q in data}

lines = []
for i in ids_to_check:
    q = by_id[i]
    ans = q["answer"]
    opts = q["options"]
    if isinstance(ans, list):
        ans_text = "; ".join(f"{k}:{opts[k]}" for k in ans)
    else:
        ans_text = f"{ans}:{opts[ans]}"
    lines.append(f"=== ID {i} ===\nQ: {q['question']}\nANSWER: {ans_text}\nEXPL: {q['explanation'][:300]}\n")

with open(os.path.join(ROOT, "scripts/review.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print("done", len(lines))
