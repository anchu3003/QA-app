import json
import os
import re

import quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_module(path):
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    # Strip ES module "export " keywords so the file can be evaluated as a script.
    return re.sub(r"^export\s+", "", text, flags=re.M)


HARNESS = r"""
var __tests = [];
function T(name, fn) { __tests.push([name, fn]); }
function eq(a, b, label) {
  var x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error((label || '') + ' expected ' + y + ' got ' + x);
}
function ok(v, label) { if (!v) throw new Error((label || 'value') + ' was falsy'); }

T('validate accepts valid single-answer', function () {
  var r = validateAndNormalize([{ question: 'Q?', options: { a: 'A', b: 'B' }, answer: 'a', topic: 'T', explanation: 'E', id: 7 }]);
  eq(r.errors.length, 0); eq(r.questions.length, 1); eq(r.questions[0].id, '7');
  eq(r.questions[0].isMulti, false); eq(r.questions[0].correctKeys, ['a']); eq(r.questions[0].topic, 'T');
});
T('validate collects every bad row', function () {
  var r = validateAndNormalize([
    { question: 'ok', options: { a: 1, b: 2 }, answer: 'a' },
    { question: '', options: { a: 1, b: 2 }, answer: 'a' },
    { question: 'no options' }
  ]);
  eq(r.questions.length, 1); eq(r.errors.length, 2);
});
T('validate is case-insensitive on keys', function () {
  var r = validateAndNormalize([{ question: 'q', options: { A: 'x', B: 'y' }, answer: 'a' }]);
  eq(r.questions[0].correctKeys, ['A']);
});
T('validate supports multi-answer arrays', function () {
  var r = validateAndNormalize([{ question: 'q', options: { a: 1, b: 2, c: 3 }, answer: ['a', 'c'] }]);
  eq(r.questions[0].isMulti, true); eq(r.questions[0].correctKeys, ['a', 'c']);
});
T('validate de-duplicates ids', function () {
  var r = validateAndNormalize([
    { question: 'q1', options: { a: 1, b: 2 }, answer: 'a', id: 5 },
    { question: 'q2', options: { a: 1, b: 2 }, answer: 'a', id: 5 }
  ]);
  ok(r.questions[0].id !== r.questions[1].id);
});
T('validate reports non-array root', function () {
  var r = validateAndNormalize({ nope: true });
  eq(r.errors.length, 1);
});
T('scoring exact multi match', function () { ok(isCorrectSelection({ correctKeys: ['a','c'] }, new Set(['a','c']))); });
T('scoring partial is wrong', function () { ok(!isCorrectSelection({ correctKeys: ['a','c'] }, new Set(['a']))); });
T('scoring extra is wrong', function () { ok(!isCorrectSelection({ correctKeys: ['a','c'] }, new Set(['a','c','d']))); });
T('computeResults counts', function () {
  var q = { correctKeys: ['a','c'] };
  var r = computeResults([q, q], [new Set(['a','c']), new Set(['b'])]);
  eq(r.correctCount, 1); eq(r.total, 2); eq(r.details[1].isCorrect, false);
});
T('totalPages', function () { eq(totalPages(0), 1); eq(totalPages(25), 1); eq(totalPages(26), 2); eq(totalPages(26, 10), 3); });
T('getPaginationRange', function () {
  eq(getPaginationRange(1, 10), [1,2,3,'...',10]);
  eq(getPaginationRange(5, 5), [1,2,3,4,5]);
});
T('groupByTopic sorts + counts', function () {
  var g = groupByTopic([{ topic: 'B', id: 1 }, { topic: 'A', id: 2 }, { topic: 'A', id: 3 }], { 3: true });
  eq(g[0].topic, 'A'); eq(g[0].total, 2); eq(g[0].done, 1);
});
T('formatText bold', function () { ok(formatText('**hi**').indexOf('<strong>hi</strong>') >= 0); });
T('formatText code', function () { ok(formatText('use `code`').indexOf('<code>code</code>') >= 0); });
T('formatText image', function () { ok(formatText('![alt](https://x.io/a.png)').indexOf('<img') >= 0); });
T('formatText link', function () { ok(formatText('[s](https://example.com)').indexOf('href="https://example.com"') >= 0); });
T('formatText blocks javascript:', function () { ok(formatText('[x](javascript:alert(1))').indexOf('javascript:') < 0); });
T('formatText bullets', function () { ok(formatText('- one\n- two').indexOf('<ul><li>one</li><li>two</li></ul>') >= 0); });
T('formatText escapes tags', function () { ok(formatText('<b>x</b>').indexOf('&lt;b&gt;x&lt;/b&gt;') >= 0); });
T('escapeHtml escapes quotes', function () { eq(escapeHtml('"\'&<>'), '&quot;&#39;&amp;&lt;&gt;'); });
T('safeUrl http only', function () {
  eq(safeUrl('https://a.io/b.png'), 'https://a.io/b.png');
  eq(safeUrl('javascript:alert(1)'), '');
  eq(safeUrl('data:text/html,x'), '');
});
T('shuffle preserves input', function () {
  var a = [1,2,3,4,5]; var o = shuffle(a);
  eq(o.length, a.length); eq(o.slice().sort(), [1,2,3,4,5]); eq(a, [1,2,3,4,5]);
});
T('formatDuration', function () { eq(formatDuration(65000), '1:05'); eq(formatDuration(3600000), '1:00:00'); });
T('clamp', function () { eq(clamp(9, 0, 5), 5); eq(clamp(-2, 0, 5), 0); });

var __passed = 0, __failed = 0, __fails = [];
for (var i = 0; i < __tests.length; i++) {
  try { __tests[i][1](); __passed++; }
  catch (e) { __failed++; __fails.push(__tests[i][0] + ' :: ' + e.message); }
}
JSON.stringify({ passed: __passed, failed: __failed, failures: __fails });
"""

utils_js = load_module(os.path.join(ROOT, "js", "utils.js"))
model_js = load_module(os.path.join(ROOT, "js", "model.js"))

ctx = quickjs.Context()
script = utils_js + "\n" + model_js + "\n" + HARNESS
result_json = ctx.eval(script)
result = json.loads(result_json)

print(f"passed={result['passed']} failed={result['failed']}")
for failure in result["failures"]:
    print("  FAIL:", failure)
