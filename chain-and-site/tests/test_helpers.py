"""Verifies the contract's pure helpers (SHA-256, time math, verdict parsing) against Python's reference code."""
import ast, hashlib, pathlib, datetime, random

src = (pathlib.Path(__file__).parent.parent / "contracts" / "quotebond.py").read_text()
tree = ast.parse(src)
keep = {"_norm", "_ror", "_sha256_hex", "_unix", "_parse_verdict", "_strip_tags", "_squash", "_locate"}
nodes = [n for n in tree.body if (isinstance(n, ast.FunctionDef) and n.name in keep)
         or (isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in ("_K", "VERDICTS", "_FOLD"))]
ns = {"json": __import__("json")}
exec(compile(ast.Module(body=nodes, type_ignores=[]), "helpers", "exec"), ns)

# SHA-256 must match hashlib for many lengths (padding edge cases at 55, 56, 63, 64, 119, 120 bytes)
random.seed(1)
for n in list(range(0, 130)) + [500, 1000]:
    s = "".join(random.choice("abc é中 ") for _ in range(n))
    assert ns["_sha256_hex"](s) == hashlib.sha256(s.encode()).hexdigest(), f"sha256 mismatch at {n}"

# time math must match datetime for the format GenLayer sends
for iso in ["2026-09-27T09:14:14.081651Z", "2026-10-09T09:42:35.000000Z", "2024-02-29T23:59:59.999999Z", "2000-01-01T00:00:00.000000Z", "2026-03-01T00:00:00.000000Z"]:
    expected = int(datetime.datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=datetime.timezone.utc).timestamp())
    assert ns["_unix"](iso) == expected, iso

p = ns["_parse_verdict"]
assert p('{"verdict": "supported"}') == "supported"
assert p("```json\n{\"verdict\":\"unsupported\"}\n```") == "unsupported"
assert p("Supported.") == "supported"
assert p("it is supported and unsupported") == "inconclusive"
assert p("") == "inconclusive"
assert ns["_norm"]("  A  b\nC ") == "a b c"
assert ns["_norm"]("AI\u2011native \u201cX\u201d\u00a0y") == "ai-native \"x\" y"
assert ns["_norm"](ns["_strip_tags"]("<h1>Example Domain</h1><p>text</p>")) == "example domain text"
assert ns["_locate"]("hello example domain here", "example domain") == 6
assert ns["_locate"]("the ai\u2011native, blockchain!", "ai-native blockchain") >= 0
assert ns["_locate"]("nothing here", "example domain") == -1
print("helper checks passed (sha256, time math, verdict parsing)")
