"""Static checks that need no GenLayer install: run `make test`."""
import ast, pathlib, sys

src = (pathlib.Path(__file__).parent.parent / "contracts" / "quotebond.py").read_text()
lines = src.splitlines()
errors = []

if not lines[0].startswith("# v0.3.0"): errors.append("line 1 must be the version header")
if "Depends" not in lines[1] or ":latest" in lines[1]: errors.append("line 2 must pin the Depends hash")

tree = ast.parse(src)
contracts = [c for c in tree.body if isinstance(c, ast.ClassDef)
             and any(ast.unparse(b) == "gl.contract.Contract" for b in c.bases)]
if len(contracts) != 1: errors.append("exactly one gl.contract.Contract class is required")
else:
    for fn in [f for f in contracts[0].body if isinstance(f, ast.FunctionDef)]:
        public = any("gl.public" in ast.unparse(d) for d in fn.decorator_list)
        if public and fn.returns is None: errors.append(f"{fn.name}: public methods need a return annotation")
        if fn.name.startswith("_") and fn.name != "__init__" and public: errors.append(f"{fn.name}: private but public")
    names = {f.name for f in contracts[0].body if isinstance(f, ast.FunctionDef)}
    for need in ("publish", "cancel", "challenge", "request_refund", "reclaim_expired", "resolve", "withdraw", "get_config", "get_claim", "get_claim_count", "get_credit"):
        if need not in names: errors.append(f"missing method {need}")

for bad in ("import time", "import random", "import os", "import datetime", "from datetime", "hashlib"):
    if bad in src: errors.append(f"forbidden/unsafe in contract: {bad}")
if "gl.message_raw" not in src: errors.append("timeout recovery needs gl.message_raw time")

if errors: print("FAIL\n" + "\n".join(errors)); sys.exit(1)
print("quotebond.py static checks passed")
