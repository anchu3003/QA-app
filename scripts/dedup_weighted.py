import os
import json
import re
import math
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STOPWORDS = set("""
a an the and or of to in on for with is are was were be been being this that these those
which what who whom will would should could must can may might shall not no as at by from
it its into if then than about over under between within without across per each also
company solution architect solutions requirements requirement meet meets application
applications uses use using used needs need wants want new create creates created
following combination steps step recommend recommends least most cost operational
overhead currently currently recently instances instance running runs run based way
best fit meets satisfy satisfies aws amazon cloud service services account accounts
data time users user without while has have had does do custom will able all any some
same different both either during after before between across still able like such only
""".split())

TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text):
    text = text.lower()
    tokens = TOKEN_RE.findall(text)
    return [t for t in tokens if t not in STOPWORDS and len(t) > 2]


def correct_answer_text(q):
    ans = q.get("answer")
    opts = q.get("options", {})
    keys = ans if isinstance(ans, list) else [ans]
    return " ".join(opts.get(k, "") for k in keys)


def main():
    path = os.path.join(ROOT, "quiz-new.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # token sets: question stem + correct answer text (weighted more) + explanation (light)
    df = Counter()
    for q in data:
        qtok = set(tokenize(q.get("question", "")))
        atok = set(tokenize(correct_answer_text(q)))
        combined = qtok | atok
        q["_tok"] = combined
        q["_qtok"] = qtok
        for t in combined:
            df[t] += 1

    n_docs = len(data)
    idf = {t: math.log(n_docs / (1 + c)) for t, c in df.items()}

    def weighted_jaccard(a, b):
        if not a or not b:
            return 0.0
        inter = a & b
        union = a | b
        num = sum(idf.get(t, 0) for t in inter)
        den = sum(idf.get(t, 0) for t in union)
        return num / den if den else 0.0

    by_topic = defaultdict(list)
    for q in data:
        by_topic[q.get("topic", "")].append(q)

    parent = {q["id"]: q["id"] for q in data}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union_ids(x, y):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[max(rx, ry)] = min(rx, ry)

    THRESHOLD = 0.33
    pairs_found = []
    for topic, qs in by_topic.items():
        n = len(qs)
        for i in range(n):
            for j in range(i + 1, n):
                sim = weighted_jaccard(qs[i]["_tok"], qs[j]["_tok"])
                if sim >= THRESHOLD:
                    pairs_found.append((sim, qs[i]["id"], qs[j]["id"]))
                    union_ids(qs[i]["id"], qs[j]["id"])

    pairs_found.sort(reverse=True)
    print(f"Threshold={THRESHOLD}  pairs found: {len(pairs_found)}")

    clusters = defaultdict(list)
    for q in data:
        clusters[find(q["id"])].append(q["id"])
    multi = {r: sorted(ids) for r, ids in clusters.items() if len(ids) > 1}
    print(f"Clusters >1: {len(multi)}  total in clusters: {sum(len(v) for v in multi.values())}")
    print(f"Condensed total: {len(clusters)}")

    id_to_q = {q["id"]: q for q in data}
    out = []
    for sim, i, j in pairs_found[:400]:
        out.append({
            "sim": round(sim, 3),
            "id1": i, "q1": id_to_q[i]["question"][:100],
            "id2": j, "q2": id_to_q[j]["question"][:100],
        })
    with open(os.path.join(ROOT, "scripts/pairs_preview.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print("wrote pairs_preview.json with top pairs (up to 400)")

    with open(os.path.join(ROOT, "scripts/clusters_weighted.json"), "w", encoding="utf-8") as f:
        json.dump(sorted(multi.items()), f, indent=2, ensure_ascii=False)
    print("wrote clusters_weighted.json")


if __name__ == "__main__":
    main()
