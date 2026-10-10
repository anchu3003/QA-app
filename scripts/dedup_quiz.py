import os
import json
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STOPWORDS = set("""
a an the and or of to in on for with is are was were be been being this that these those
which what who whom will would should could must can may might shall not no as at by from
it its into if then than than than about over under between within without across per each
company solution architect solutions requirements requirement meet meets application
""".split())

TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text):
    text = text.lower()
    tokens = TOKEN_RE.findall(text)
    return {t for t in tokens if t not in STOPWORDS and len(t) > 2}


def correct_answer_text(q):
    ans = q.get("answer")
    opts = q.get("options", {})
    if isinstance(ans, list):
        keys = ans
    else:
        keys = [ans]
    parts = []
    for k in keys:
        if k in opts:
            parts.append(opts[k])
    return " ".join(parts)


def jaccard(a, b):
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def main():
    path = os.path.join(ROOT, "quiz-new.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"Loaded {len(data)} questions")

    # Precompute token sets
    for q in data:
        q["_q_tokens"] = tokenize(q.get("question", ""))
        q["_a_tokens"] = tokenize(correct_answer_text(q))
        q["_combined"] = q["_q_tokens"] | q["_a_tokens"]

    # Group by topic to limit comparisons
    by_topic = defaultdict(list)
    for q in data:
        by_topic[q.get("topic", "")].append(q)

    # Union-Find
    parent = {q["id"]: q["id"] for q in data}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        rx, ry = find(x), find(y)
        if rx != ry:
            # keep smaller id as root
            if rx < ry:
                parent[ry] = rx
            else:
                parent[rx] = ry

    THRESHOLD_Q = 0.55   # question stem similarity
    THRESHOLD_COMBINED = 0.45  # combined question+answer similarity

    pair_count = 0
    merge_count = 0
    for topic, qs in by_topic.items():
        n = len(qs)
        for i in range(n):
            qi = qs[i]
            for j in range(i + 1, n):
                qj = qs[j]
                pair_count += 1
                jq = jaccard(qi["_q_tokens"], qj["_q_tokens"])
                if jq >= THRESHOLD_Q:
                    union(qi["id"], qj["id"])
                    merge_count += 1
                    continue
                jc = jaccard(qi["_combined"], qj["_combined"])
                if jc >= THRESHOLD_COMBINED and jq >= 0.30:
                    union(qi["id"], qj["id"])
                    merge_count += 1

    print(f"Compared {pair_count} pairs, merged {merge_count} pairs")

    clusters = defaultdict(list)
    for q in data:
        clusters[find(q["id"])].append(q["id"])

    multi_clusters = {r: ids for r, ids in clusters.items() if len(ids) > 1}
    print(f"Clusters with >1 member: {len(multi_clusters)}")
    total_in_clusters = sum(len(v) for v in multi_clusters.values())
    print(f"Total questions in multi-clusters: {total_in_clusters}")
    print(f"Resulting condensed count: {len(clusters)}")

    # Save cluster report for review
    report_path = os.path.join(ROOT, "scripts/cluster_report.json")
    report = []
    id_to_q = {q["id"]: q for q in data}
    for root, ids in sorted(multi_clusters.items()):
        report.append({
            "root": root,
            "ids": sorted(ids),
            "questions": [id_to_q[i]["question"][:120] for i in sorted(ids)]
        })
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"Wrote cluster report with {len(report)} clusters to {report_path}")


if __name__ == "__main__":
    main()
