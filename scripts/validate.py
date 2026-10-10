import json
import os
import re

import quickjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS_DIR = os.path.join(ROOT, "js")

problems = []


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def strip_imports_exports(src):
    src = re.sub(r"^import\b[\s\S]*?;", "", src, flags=re.M)
    src = re.sub(r"^export\s+", "", src, flags=re.M)
    return src


# ---- 1. JSON / webmanifest validity --------------------------------------
json_files = []
for base, _dirs, names in os.walk(ROOT):
    if os.sep + ".git" in base:
        continue
    for name in names:
        if name.endswith(".json") or name.endswith(".webmanifest"):
            json_files.append(os.path.join(base, name))
for path in json_files:
    try:
        with open(path, "r", encoding="utf-8") as f:
            json.load(f)
    except Exception as exc:  # noqa: BLE001
        problems.append(f"INVALID JSON: {os.path.relpath(path, ROOT)} -> {exc}")

# ---- 2. JS syntax check (parse only, no execution) -----------------------
js_files = sorted(
    os.path.join(JS_DIR, n)
    for n in os.listdir(JS_DIR)
    if n.endswith(".js")
)
proof = []
for path in js_files:
    src = strip_imports_exports(read(path))
    proof.append({"name": os.path.relpath(path, ROOT), "src": src})

harness = r"""
var files = %s;
var out = {};
files.forEach(function (f) {
  try { new Function('"use strict";\n' + f.src); out[f.name] = 'ok'; }
  catch (e) { out[f.name] = String(e); }
});
JSON.stringify(out);
""" % json.dumps(proof)

ctx = quickjs.Context()
syntax = json.loads(ctx.eval(harness))
for name, status in syntax.items():
    if status != "ok":
        problems.append(f"JS SYNTAX ERROR: {name} -> {status}")

# ---- 3. index.html ids vs dom.js getElementById --------------------------
html = read(os.path.join(ROOT, "index.html"))
html_ids = set(re.findall(r'\bid="([^"]+)"', html))

dom_js = read(os.path.join(JS_DIR, "dom.js"))
dom_map = re.findall(r'(\w+):\s*document\.getElementById\("([^"]+)"\)', dom_js)
for key, dom_id in dom_map:
    if dom_id not in html_ids:
        problems.append(f"dom.js key '{key}' -> getElementById('{dom_id}') not found in index.html")

dom_keys = {key for key, _ in dom_map}

# ---- 4. el.X usages exist in dom.js --------------------------------------
for path in js_files:
    src = read(path)
    rel = os.path.relpath(path, ROOT)
    for used in set(re.findall(r"\bel\.([A-Za-z0-9_$]+)", src)):
        if used not in dom_keys:
            problems.append(f"{rel}: uses el.{used} which is not defined in dom.js")

# ---- 5. import names resolve to exports ----------------------------------
def exported_names(src):
    names = set(re.findall(r"export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)", src))
    for block in re.findall(r"export\s*\{([^}]*)\}", src):
        for part in block.split(","):
            part = part.strip()
            if not part:
                continue
            names.add(part.split(" as ")[-1].strip())
    return names


exports_cache = {}
for path in js_files:
    exports_cache[os.path.basename(path)] = exported_names(read(path))

for path in js_files:
    rel = os.path.relpath(path, ROOT)
    src = read(path)
    for names_blob, target in re.findall(r"import\s*\{([^}]*)\}\s*from\s*\"\./([^\"]+)\"", src):
        target_name = os.path.basename(target)
        if target_name not in exports_cache:
            problems.append(f"{rel}: imports from missing module {target}")
            continue
        available = exports_cache[target_name]
        for raw in names_blob.split(","):
            name = raw.split(" as ")[0].strip()
            if name and name not in available:
                problems.append(f"{rel}: imports '{name}' but {target} does not export it")
    for target in re.findall(r"import\s*\*\s*as\s*\w+\s*from\s*\"\./([^\"]+)\"", src):
        if os.path.basename(target) not in exports_cache:
            problems.append(f"{rel}: namespace-imports missing module {target}")

# ---- 6. sw.js APP_SHELL files exist --------------------------------------
sw = read(os.path.join(ROOT, "sw.js"))
shell_block = re.search(r"const APP_SHELL = \[([^\]]*)\]", sw)
if shell_block:
    for entry in re.findall(r'"([^"]+)"', shell_block.group(1)):
        if entry == "./":
            continue
        if not os.path.exists(os.path.join(ROOT, entry)):
            problems.append(f"sw.js APP_SHELL references missing file: {entry}")
else:
    problems.append("sw.js: APP_SHELL array not found")

# ---- 7. index.html local asset references exist --------------------------
for ref in re.findall(r'(?:href|src)="([^"]+)"', html):
    if ref.startswith(("http://", "https://", "data:", "#")):
        continue
    if not os.path.exists(os.path.join(ROOT, ref)):
        problems.append(f"index.html references missing file: {ref}")

# ---- 8. duplicate ids in index.html --------------------------------------
all_ids = re.findall(r'\bid="([^"]+)"', html)
dupes = {i for i in all_ids if all_ids.count(i) > 1}
for d in sorted(dupes):
    problems.append(f"index.html has duplicate id: {d}")

print(f"checked {len(js_files)} JS files, {len(json_files)} JSON files, {len(html_ids)} html ids")
if problems:
    print(f"\n{len(problems)} PROBLEM(S):")
    for p in problems:
        print("  -", p)
    raise SystemExit(1)
print("ALL STRUCTURAL CHECKS PASSED")
