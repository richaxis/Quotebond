# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import json
import genlayer as gl
from genlayer.types import *

VERSION = "3.0.3"
VERDICTS = ("supported", "unsupported", "inconclusive")
MAX_CLAIM, MIN_QUOTE, MAX_QUOTE, MAX_URL = 300, 8, 500, 300
MIN_TIMEOUT, MAX_TIMEOUT = 60, 30 * 24 * 3600  # seconds
DEFAULT_TIMEOUT = 24 * 3600  # used when the deploy form is left at 0 or empty

_K = [
    0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
    0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
    0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
    0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
    0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
    0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
    0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
    0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
]


# Look-alike characters (curly quotes, long dashes, non-breaking spaces) folded to plain ASCII,
# so a quote copied from a web page still matches the page text.
_FOLD = {
    0x2010: "-", 0x2011: "-", 0x2012: "-", 0x2013: "-", 0x2014: "-", 0x2212: "-",
    0x2018: "'", 0x2019: "'", 0x201C: '"', 0x201D: '"', 0x00A0: " ", 0x200B: "",
}


def _norm(text: str) -> str:
    return " ".join(text.translate(_FOLD).lower().split())


def _squash(text: str):
    """Keep only letters and digits. Returns (squashed text, index of each kept char in the original)."""
    chars, idx = [], []
    for i, ch in enumerate(text):
        if ch.isalnum():
            chars.append(ch)
            idx.append(i)
    return "".join(chars), idx


def _locate(text: str, q: str) -> int:
    """Return the start position of the quote in text, ignoring spaces/punctuation; -1 if absent."""
    at = text.find(q)
    if at >= 0:
        return at
    sq, _ = _squash(q)
    st, idx = _squash(text)
    if len(sq) < 4:
        return -1
    pos = st.find(sq)
    return idx[pos] if pos >= 0 else -1


def _strip_tags(html: str) -> str:
    """Very small HTML -> text converter used only when the text renderer returns nothing."""
    out, depth = [], 0
    for ch in html:
        if ch == "<":
            depth += 1
            out.append(" ")
        elif ch == ">":
            depth = max(0, depth - 1)
            out.append(" ")
        elif depth == 0:
            out.append(ch)
    return "".join(out)


def _ror(x: int, n: int) -> int:
    return ((x >> n) | (x << (32 - n))) & 0xFFFFFFFF


def _sha256_hex(text: str) -> str:
    """Pure-Python SHA-256 so the contract does not depend on any extra stdlib module."""
    data = text.encode("utf-8")
    h = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19]
    bits = len(data) * 8
    data += b"\x80"
    data += b"\x00" * ((56 - len(data) % 64) % 64)
    data += bits.to_bytes(8, "big")
    for i in range(0, len(data), 64):
        w = [int.from_bytes(data[i + j * 4: i + j * 4 + 4], "big") for j in range(16)]
        for j in range(16, 64):
            s0 = _ror(w[j - 15], 7) ^ _ror(w[j - 15], 18) ^ (w[j - 15] >> 3)
            s1 = _ror(w[j - 2], 17) ^ _ror(w[j - 2], 19) ^ (w[j - 2] >> 10)
            w.append((w[j - 16] + s0 + w[j - 7] + s1) & 0xFFFFFFFF)
        a, b, c, d, e, f, g, k = h
        for j in range(64):
            t1 = (k + (_ror(e, 6) ^ _ror(e, 11) ^ _ror(e, 25)) + ((e & f) ^ ((~e) & g)) + _K[j] + w[j]) & 0xFFFFFFFF
            t2 = ((_ror(a, 2) ^ _ror(a, 13) ^ _ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) & 0xFFFFFFFF
            k, g, f, e, d, c, b, a = g, f, e, (d + t1) & 0xFFFFFFFF, c, b, a, (t1 + t2) & 0xFFFFFFFF
        h = [(x + y) & 0xFFFFFFFF for x, y in zip(h, [a, b, c, d, e, f, g, k])]
    return "".join(f"{x:08x}" for x in h)


def _unix(iso: str) -> int:
    """'2026-09-27T09:14:14.081651Z' -> unix seconds, integer math only (datetime is forbidden in contracts)."""
    y, mo, d = int(iso[0:4]), int(iso[5:7]), int(iso[8:10])
    hh, mi, ss = int(iso[11:13]), int(iso[14:16]), int(iso[17:19])
    y -= 1 if mo <= 2 else 0
    era = y // 400
    yoe = y - era * 400
    doy = (153 * ((mo + 9) % 12) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return (era * 146097 + doe - 719468) * 86400 + hh * 3600 + mi * 60 + ss


def _now() -> int:
    """Transaction time from the consensus-agreed message; 0 if the runtime does not provide it."""
    try:
        return _unix(gl.message_raw["datetime"])
    except Exception:
        return 0


def _parse_verdict(raw: str) -> str:
    """Strict parsing: JSON {"verdict": ...} or exactly one bare word. Anything else is inconclusive."""
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    word = cleaned.lower().strip(" \n\t\"'.")
    try:
        obj = json.loads(cleaned)
        if isinstance(obj, dict):
            word = str(obj.get("verdict", "")).strip().lower()
    except Exception:
        pass
    return word if word in VERDICTS else "inconclusive"


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


class Quotebond(gl.contract.Contract):
    claims: gl.storage.TreeMap[u256, str]  # claim id -> JSON record
    credits: gl.storage.TreeMap[Address, u256]  # withdrawable balances
    next_id: u256
    resolve_timeout: u256  # seconds a challenged claim may stay unresolved before anyone can refund it

    def __init__(self, resolve_timeout_seconds: int = 0):
        if resolve_timeout_seconds == 0:
            resolve_timeout_seconds = DEFAULT_TIMEOUT  # 0 or empty means "use the 24 hour default"
        if resolve_timeout_seconds < MIN_TIMEOUT or resolve_timeout_seconds > MAX_TIMEOUT:
            raise gl.vm.UserError("timeout must be between 60 seconds and 30 days")
        self.next_id = 0
        self.resolve_timeout = resolve_timeout_seconds

    # ---------- write ----------

    @gl.public.write.payable
    def publish(self, claim: str, quote: str, url: str) -> None:
        """Post a claim with a bond. Validators capture the source evidence NOW and the contract stores it."""
        bond = gl.message.value
        claim, quote, url = claim.strip(), quote.strip(), url.strip()
        if bond == 0:
            raise gl.vm.UserError("send a bond")
        if not claim or len(claim) > MAX_CLAIM:
            raise gl.vm.UserError("claim must be 1-300 characters")
        if len(quote) < MIN_QUOTE or len(quote) > MAX_QUOTE:
            raise gl.vm.UserError("quote must be 8-500 characters")
        if not url.startswith("https://") or len(url) > MAX_URL or " " in url:
            raise gl.vm.UserError("url must be an https:// link without spaces")

        q = _norm(quote)
        if len(_squash(q)[0]) < 4:
            raise gl.vm.UserError("quote must contain at least 4 letters or digits")

        def capture() -> str:
            def out(ok: bool, excerpt: str, note: str) -> str:
                return json.dumps({"ok": ok, "excerpt": excerpt, "note": note}, sort_keys=True)

            texts = []
            try:
                t = _norm(gl.nondet.web.render(url, mode="text"))
                if t:
                    texts.append(t)
            except Exception:
                pass
            try:
                resp = gl.nondet.web.request(url, method="GET")
                body = resp.body if resp.body is not None else b""
                t = _norm(_strip_tags(body.decode("utf-8", errors="replace")))
                if t:
                    texts.append(t)
            except Exception:
                pass
            if not texts:
                return out(False, "", "source page returned no readable text")
            for text in texts:
                at = _locate(text, q)
                if at >= 0:
                    return out(True, text[max(0, at - 300): at + len(q) + 300], "captured at publish")
            seen = "".join(c for c in texts[0][:60] if 32 <= ord(c) < 127)
            return out(False, "", "quote not found on the source page; validators saw: " + seen)

        snap = json.loads(gl.eq_principle.strict_eq(capture))
        if not snap["ok"]:
            raise gl.vm.UserError(snap["note"])  # reverts, so the bond is returned to the sender

        record = {
            "author": gl.message.sender_address.as_hex,
            "challenger": "",
            "claim": claim,
            "quote": quote,
            "quote_hash": _sha256_hex(q),
            "url": url,
            "bond": int(bond),
            "stake": 0,
            "status": "open",  # open|challenged|supported|unsupported|inconclusive|cancelled|refunded|expired
            "refund_by": [],
            "published_at": _now(),
            "challenged_at": 0,
            "evidence_excerpt": snap["excerpt"],  # snapshot taken at publish: the authoritative evidence
            "evidence_hash": _sha256_hex(snap["excerpt"]),
            "evidence_note": snap["note"],
        }
        self.claims[self.next_id] = json.dumps(record)
        self.next_id = self.next_id + 1

    @gl.public.write
    def cancel(self, claim_id: int) -> None:
        """Escrow recovery 1: the author takes the bond back while nobody has challenged."""
        rec = self._load(claim_id)
        if rec["status"] != "open":
            raise gl.vm.UserError("only an unchallenged claim can be cancelled")
        if gl.message.sender_address.as_hex != rec["author"]:
            raise gl.vm.UserError("only the author can cancel")
        self._credit(Address(rec["author"]), rec["bond"])
        rec["status"] = "cancelled"
        self._save(claim_id, rec)

    @gl.public.write.payable
    def challenge(self, claim_id: int) -> None:
        """A different account matches the bond exactly and disputes the claim. Starts the resolve timer."""
        rec = self._load(claim_id)
        if rec["status"] != "open":
            raise gl.vm.UserError("claim is not open")
        if gl.message.sender_address.as_hex == rec["author"]:
            raise gl.vm.UserError("the author cannot challenge their own claim")
        if gl.message.value != rec["bond"]:
            raise gl.vm.UserError("stake must equal the bond")
        rec["challenger"] = gl.message.sender_address.as_hex
        rec["stake"] = int(gl.message.value)
        rec["status"] = "challenged"
        rec["challenged_at"] = _now()
        self._save(claim_id, rec)

    @gl.public.write
    def request_refund(self, claim_id: int) -> None:
        """Escrow recovery 2: if BOTH parties of a challenged claim ask, both get their money back."""
        rec = self._load(claim_id)
        if rec["status"] != "challenged":
            raise gl.vm.UserError("claim is not challenged")
        me = gl.message.sender_address.as_hex
        if me != rec["author"] and me != rec["challenger"]:
            raise gl.vm.UserError("only the author or the challenger can ask")
        if me not in rec["refund_by"]:
            rec["refund_by"].append(me)
        if len(rec["refund_by"]) == 2:
            self._credit(Address(rec["author"]), rec["bond"])
            self._credit(Address(rec["challenger"]), rec["stake"])
            rec["status"] = "refunded"
        self._save(claim_id, rec)

    @gl.public.write
    def reclaim_expired(self, claim_id: int) -> None:
        """Escrow recovery 3 (timeout): after the resolve timeout anyone can refund both sides."""
        rec = self._load(claim_id)
        if rec["status"] != "challenged":
            raise gl.vm.UserError("claim is not challenged")
        if rec["challenged_at"] <= 0:
            raise gl.vm.UserError("no challenge timestamp is available for this claim")
        now = _now()
        if now <= 0 or now < rec["challenged_at"] + self.resolve_timeout:
            raise gl.vm.UserError("resolve timeout has not been reached")
        self._credit(Address(rec["author"]), rec["bond"])
        self._credit(Address(rec["challenger"]), rec["stake"])
        rec["status"] = "expired"
        self._save(claim_id, rec)

    @gl.public.write
    def resolve(self, claim_id: int) -> str:
        """Validators judge the claim against the evidence snapshot stored at publish time."""
        rec = self._load(claim_id)
        if rec["status"] != "challenged":
            raise gl.vm.UserError("claim is not challenged")

        # copy to locals: storage can't be read inside the non-deterministic block
        claim, quote, excerpt = rec["claim"], rec["quote"], rec["evidence_excerpt"]

        def judge() -> str:
            task = f"""
This is an excerpt of a source page, captured when the claim was published (normalized, lowercase):
{excerpt}
End of excerpt.

Claim: {claim}
Quoted text: {quote}

Does the excerpt, in context, support the claim? "supported" if the quote means what the claim says.
"unsupported" if the claim twists or overstates it. "inconclusive" if you cannot tell.
Respond only with JSON: {{"verdict": "supported" | "unsupported" | "inconclusive"}}
"""
            try:
                verdict = _parse_verdict(gl.nondet.exec_prompt(task))
            except Exception:
                verdict = "inconclusive"
            return json.dumps({"verdict": verdict}, sort_keys=True)

        verdict = json.loads(gl.eq_principle.strict_eq(judge))["verdict"]
        if verdict not in VERDICTS:
            verdict = "inconclusive"

        author, challenger = Address(rec["author"]), Address(rec["challenger"])
        bond, stake = rec["bond"], rec["stake"]
        if verdict == "supported":
            self._credit(author, bond + stake)
        elif verdict == "unsupported":
            self._credit(challenger, bond + stake)
        else:
            self._credit(author, bond)
            self._credit(challenger, stake)

        rec["status"] = verdict
        rec["evidence_note"] = "judged on the snapshot captured at publish"
        self._save(claim_id, rec)
        return verdict

    @gl.public.write
    def withdraw(self) -> None:
        """Pull payment: credits are zeroed before the transfer is emitted."""
        me = gl.message.sender_address
        amount = self.credits.get(me, 0)
        if amount == 0:
            raise gl.vm.UserError("nothing to withdraw")
        self.credits[me] = 0
        _Recipient(me).emit_transfer(value=amount)

    # ---------- view ----------

    @gl.public.view
    def get_claim(self, claim_id: int) -> str:
        if claim_id < 0 or claim_id >= self.next_id:
            raise gl.vm.UserError("unknown claim")
        return self.claims[claim_id]  # JSON string; the frontend parses it

    @gl.public.view
    def get_claim_count(self) -> int:
        return self.next_id

    @gl.public.view
    def get_credit(self, account: str) -> str:
        return str(self.credits.get(Address(account), 0))

    @gl.public.view
    def get_config(self) -> str:
        return json.dumps({"version": VERSION, "resolve_timeout_seconds": int(self.resolve_timeout)})

    @gl.public.view
    def get_version(self) -> str:
        return VERSION

    # ---------- internal ----------

    def _load(self, claim_id: int) -> dict:
        if claim_id < 0 or claim_id >= self.next_id:
            raise gl.vm.UserError("unknown claim")
        return json.loads(self.claims[claim_id])

    def _save(self, claim_id: int, rec: dict) -> None:
        self.claims[claim_id] = json.dumps(rec)

    def _credit(self, who: Address, amount: int) -> None:
        self.credits[who] = self.credits.get(who, 0) + amount
