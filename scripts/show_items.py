import pickle, json

with open('_tmp_dedup.pkl', 'rb') as f:
    d = pickle.load(f)
by_id = {item['id']: item for item in d}

import sys
ids = [int(x) for x in sys.argv[1:]]
for i in ids:
    item = by_id[i]
    print('=' * 80)
    print('ID:', item['id'], '| topic:', item['topic'])
    print('Q:', item['question'])
    print('OPTIONS:', item['options'])
    print('ANSWER:', item['answer'])
    print('EXPLANATION:', item['explanation'])
    print()
