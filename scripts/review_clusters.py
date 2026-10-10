import pickle, json

with open('_tmp_dedup.pkl', 'rb') as f:
    d = pickle.load(f)
by_id = {item['id']: item for item in d}

with open('_tmp_clusters.json') as f:
    clusters = json.load(f)

for root, ids in sorted(clusters.items(), key=lambda x: -len(x[1])):
    ids = sorted(int(i) for i in ids)
    print('=== Cluster (root %s), size %d ===' % (root, len(ids)))
    for i in ids:
        item = by_id[i]
        q = item['question'][:100].replace('\n', ' ')
        ans = item['_ans_text'][:90]
        print(f'  id={item["id"]:4d} | Q: {q}')
        print(f'         ANS: {ans}')
    print()
