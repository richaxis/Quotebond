import { makeConfig, connectWallet, disconnectWallet, ensureChain, makeClient, read, write, loadClaims, toWei, fromWei, short, same } from "../../lib/chain.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cfg = makeConfig(import.meta.env);
let client = makeClient(cfg);
let me = null, claims = [], credit = "0", busy = false, timeoutSec = 0;

function toast(t) {
  const e = $("toast"); e.textContent = t; e.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("on"), 7000);
}
const banner = (t) => { $("banner").textContent = t || ""; $("banner").classList.toggle("on", !!t); };

function stats() {
  const live = claims.filter((c) => ["open", "challenged"].includes(c.status));
  const locked = live.reduce((a, c) => a + BigInt(c.bond) * (c.status === "challenged" ? 2n : 1n), 0n);
  $("s1").textContent = claims.length;
  $("s2").textContent = fromWei(locked, 2);
  $("s3").textContent = claims.filter((c) => !["open", "challenged"].includes(c.status)).length;
  $("cred").textContent = fromWei(credit) + " GEN";
  $("wd").disabled = busy || BigInt(credit) === 0n;
}

const txKey = () => `qb:tx:${cfg.address}:${(me || "").toLowerCase()}`;
const txlog = () => { try { return JSON.parse(localStorage.getItem(txKey()) || "[]"); } catch { return []; } };
const txpush = (e) => { try { localStorage.setItem(txKey(), JSON.stringify([e, ...txlog()].slice(0, 30))); } catch {} };

// What a claim means for me: [label, css class, own amount, other side's amount]
function outcome(c, role) {
  const bond = BigInt(c.bond), stake = BigInt(c.stake || c.bond);
  const own = role === "author" ? bond : stake, other = role === "author" ? stake : bond;
  if (c.status === "open") return ["Waiting for a challenger", "open", own, 0n];
  if (c.status === "challenged") return ["Awaiting verdict", "challenged", own, other];
  if (c.status === "cancelled") return ["Cancelled", "inconclusive", own, 0n];
  if (["refunded", "expired", "inconclusive"].includes(c.status)) return ["Refunded", "inconclusive", own, other];
  const won = (c.status === "supported") === (role === "author");
  return won ? ["Won", "supported", own, other] : ["Lost", "unsupported", own, other];
}

function dash() {
  const ids = ["dstats", "dpost", "dchal", "dtx"];
  if (!me) { ids.forEach((id) => ($(id).innerHTML = "")); $("dsub").textContent = "Connect your wallet to see your claims."; return; }
  $("dsub").textContent = "Everything you posted or challenged on this contract.";
  const posted = claims.filter((c) => same(c.author, me)), chal = claims.filter((c) => same(c.challenger, me));
  const rows = [...posted.map((c) => [c, "author"]), ...chal.map((c) => [c, "challenger"])].map(([c, r]) => outcome(c, r));
  const atStake = rows.filter((o) => ["open", "challenged"].includes(o[1])).reduce((a, o) => a + o[2], 0n);
  const net = rows.reduce((a, o) => a + (o[0] === "Won" ? o[3] : o[0] === "Lost" ? -o[2] : 0n), 0n);
  const stat = (v, l) => `<div class="card"><strong>${v}</strong><span>${l}</span></div>`;
  $("dstats").innerHTML = stat(posted.length + chal.length, "claims you're part of") + stat(fromWei(atStake, 2), "GEN at stake now") +
    stat((net < 0n ? "-" : net > 0n ? "+" : "") + fromWei(net < 0n ? -net : net, 2), "GEN net result") + stat(fromWei(credit, 2), "GEN ready to withdraw");
  const list = (arr, role) => arr.length ? arr.slice().reverse().map((c) => {
    const [label, cls, own] = outcome(c, role);
    return `<div class="drow"><div><b>${esc(c.claim)}</b><small>#${c.id} · you put ${fromWei(own)} GEN · ${esc(c.url)}</small></div><span class="tag ${cls}">${label}</span></div>`;
  }).join("") : `<p class="empty">Nothing here yet.</p>`;
  $("dpost").innerHTML = list(posted, "author");
  $("dchal").innerHTML = list(chal, "challenger");
  const ex = cfg.explorer.replace(/\/$/, "");
  $("dtx").innerHTML = txlog().length ? txlog().map((t) =>
    `<div class="drow"><div><b>${esc(t.label)}</b><small>${new Date(t.at).toLocaleString()}</small></div><a href="${ex}/tx/${esc(t.hash)}" target="_blank" rel="noopener">${esc(t.hash.slice(0, 10))}…</a></div>`).join("")
    : `<p class="empty">Transactions you send from this browser will appear here.</p>`;
}

const dur = (s) => (s >= 3600 ? Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m" : Math.max(1, Math.floor(s / 60)) + "m");
const evidence = (c) => c.evidence_hash
  ? `<details class="ev"><summary>Evidence captured when the claim was posted</summary><small>sha256 ${esc(c.evidence_hash)}</small><p>${esc(c.evidence_excerpt)}</p></details>` : "";

function card(c) {
  const mine = same(c.author, me);
  let action = `<span class="${c.status === "supported" ? "ok" : c.status === "unsupported" ? "no" : ""}"></span>Settled by validator consensus`;
  const party = mine || same(c.challenger, me);
  if (c.status === "open") action = mine
    ? `Waiting for a challenger <button class="ghost" data-x="${c.id}" ${busy ? "disabled" : ""}>Cancel &amp; recover bond</button>`
    : `<button class="ghost" data-c="${c.id}" ${busy ? "disabled" : ""}>Challenge · stake ${fromWei(c.bond)} GEN</button>`;
  if (c.status === "challenged") {
    const asked = (c.refund_by || []).some((a) => same(a, me));
    const left = c.challenged_at && timeoutSec ? c.challenged_at + timeoutSec - Math.floor(Date.now() / 1000) : null;
    action = `<button data-r="${c.id}" ${busy ? "disabled" : ""}>Resolve with validators</button>` +
      (party ? ` <button class="ghost" data-f="${c.id}" ${busy || asked ? "disabled" : ""}>${asked ? "Refund requested" : "Request mutual refund"}</button>` : "") +
      (left !== null && left <= 0 ? ` <button class="ghost" data-e="${c.id}" ${busy ? "disabled" : ""}>Timeout reached: refund both sides</button>`
        : left !== null ? ` <small>Refund unlocks in ${dur(left)} if unresolved</small>` : "");
  }
  return `<article class="card claim"><span class="pill ${c.status}">${c.status}</span><h3>${esc(c.claim)}</h3>
  <blockquote>“${esc(c.quote)}”</blockquote>
  <div class="meta"><span>by ${esc(short(c.author))}</span><span>${esc(c.url)}</span><span>bond ${fromWei(c.bond)} GEN</span></div>
  <div class="pool"><i style="width:${c.status === "open" ? 50 : 100}%"></i></div><div class="vrow" id="v${c.id}">${action}</div>${evidence(c)}</article>`;
}

function draw() {
  stats(); dash();
  $("list").innerHTML = claims.length ? claims.slice().reverse().map(card).join("")
    : `<div class="card">No claims yet. Post the first one with a bond.</div>`;
}

async function refresh() {
  if (!cfg.address) return;
  try {
    claims = await loadClaims(client, cfg);
    if (!timeoutSec) timeoutSec = JSON.parse(await read(client, cfg, "get_config")).resolve_timeout_seconds;
    if (me) credit = String(await read(client, cfg, "get_credit", [me]));
    banner("");
  } catch (e) { banner("This address does not answer like a Quotebond v3 contract (or the network is unreachable). Check VITE_CONTRACT_ADDRESS. Detail: " + String(e.message || e).slice(0, 120)); }
  draw();
}

async function tx(label, fn) {
  if (!cfg.address) return toast("Set VITE_CONTRACT_ADDRESS first");
  if (!me) return toast("Connect a wallet first");
  try { await ensureChain(cfg); } catch (e) { return toast(e.message || "Switch your wallet to Studio Next"); }
  busy = true; draw(); toast(label + "…");
  try { const { hash } = await fn(); txpush({ label, hash, at: Date.now() }); toast(label + " done · " + hash.slice(0, 10) + "…"); }
  catch (e) {
    if (e.hash) txpush({ label: label + " (failed)", hash: e.hash, at: Date.now() });
    console.error(label, e);
    toast((e.shortMessage || e.message || "Transaction failed").slice(0, 220));
  }
  busy = false; await refresh();
}

$("pub").onclick = () => {
  const claim = $("f1").value.trim(), quote = $("f2").value.trim(), url = $("f3").value.trim();
  let bond; try { bond = toWei($("f4").value); } catch (e) { return toast(e.message); }
  if (!claim || !quote || !/^https?:\/\//.test(url)) return toast("Fill every field with a valid https:// URL");
  tx("Posting claim", async () => { const r = await write(client, cfg, "publish", [claim, quote, url], bond); ["f1", "f2", "f3"].forEach((x) => ($(x).value = "")); return r; });
};

$("list").onclick = (e) => {
  const ex = e.target.dataset.e;
  if (ex !== undefined) tx("Reclaiming", () => write(client, cfg, "reclaim_expired", [Number(ex)]));
  const c = e.target.dataset.c, r = e.target.dataset.r, x = e.target.dataset.x, f = e.target.dataset.f;
  if (x !== undefined) tx("Cancelling", () => write(client, cfg, "cancel", [Number(x)]));
  if (f !== undefined) tx("Requesting refund", () => write(client, cfg, "request_refund", [Number(f)]));
  if (c !== undefined) { const k = claims.find((x) => x.id == c); tx("Challenging", () => write(client, cfg, "challenge", [Number(c)], BigInt(k.bond))); }
  if (r !== undefined) {
    const box = $("v" + r);
    box.innerHTML = '<span></span><span></span><span></span><span></span><span></span><em style="font-style:normal">Validators reading the page…</em>';
    [...box.querySelectorAll("span")].forEach((d, n) => setTimeout(() => d.classList.add("on"), 500 * (n + 1)));
    tx("Resolving", () => write(client, cfg, "resolve", [Number(r)]));
  }
};
$("wd").onclick = () => tx("Withdrawing", () => write(client, cfg, "withdraw"));

function setAccount(addr) {
  me = addr || null; credit = "0";
  client = makeClient(cfg, me || undefined);
  $("wbtn").textContent = me ? short(me) : "Connect wallet";
  $("wout").hidden = !me;
  draw(); refresh();
}

// First click connects (account picker + add/switch network). Clicking the address again lets you pick another account.
$("wbtn").onclick = async () => {
  try { setAccount(await connectWallet(cfg, true)); toast("Connected"); }
  catch (e) { toast(e.message || "Wallet request was rejected"); }
};
$("wout").onclick = async () => { await disconnectWallet(); setAccount(null); toast("Disconnected"); };

if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", (a) => { if (a[0] || me) setAccount(a[0] || null); });
  window.ethereum.on("chainChanged", () => toast("Network changed. We will switch back to Studio Next before sending."));
}

(async () => {
  if (!cfg.address) {
    try { cfg.address = (await (await fetch("/deployment.json")).json()).address || ""; } catch {}
  }
  $("addr").textContent = cfg.address || "not set";
  if (!cfg.address) banner("No contract address yet. Deploy quotebond.py, then set VITE_CONTRACT_ADDRESS (or public/deployment.json).");
  draw(); refresh();
})();
