// End-to-end proof on Studio Next. Needs two FUNDED test accounts and a v3 contract.
//   VITE_CONTRACT_ADDRESS=0x... KEY_A=0x... KEY_B=0x... npm run e2e
// Optional: E2E_URL, E2E_QUOTE (a real phrase from that page, >= 8 chars), E2E_BOND (default 0.1)
//   E2E_EXPIRY=1  also tests timeout recovery; deploy the contract with RESOLVE_TIMEOUT_SECONDS=60 first.
// Writes runs/e2e-report.md: paste it into docs/EVIDENCE.md.
import fs from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { makeConfig, makeChain, write, read, fromWei, toWei } from "../lib/chain.js";

const cfg = makeConfig(process.env);
const { KEY_A, KEY_B } = process.env;
if (!cfg.address || !KEY_A || !KEY_B) throw new Error("Set VITE_CONTRACT_ADDRESS, KEY_A and KEY_B");
const A = createAccount(KEY_A), B = createAccount(KEY_B);
const cA = createClient({ chain: makeChain(cfg), account: A }), cB = createClient({ chain: makeChain(cfg), account: B });
const URL_ = process.env.E2E_URL || "https://docs.genlayer.com/understand-genlayer-protocol";
const QUOTE = process.env.E2E_QUOTE || "AI-native blockchain";
const BOND = toWei(process.env.E2E_BOND || "0.1");

const rows = [];
const assert = (ok, msg) => { if (!ok) throw new Error("ASSERT FAILED: " + msg); };
const bal = async (addr) => BigInt((await (await fetch(cfg.rpc, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }) })).json()).result);
const claim = async (id) => JSON.parse(await read(cA, cfg, "get_claim", [id]));
const credit = async (acct) => BigInt(await read(cA, cfg, "get_credit", [acct.address]));
async function step(name, client, fn, args = [], value = 0n) {
  const { hash } = await write(client, cfg, fn, args, value); // throws if the receipt shows an execution error
  rows.push({ name, hash }); console.log("ok  ", name, hash); return hash;
}
async function expectFail(name, client, fn, args = [], value = 0n) {
  try { await write(client, cfg, fn, args, value); } catch (e) { rows.push({ name: `${name} (rejected as expected)`, hash: "reverted" }); console.log("ok  ", name, "rejected"); return; }
  throw new Error(`ASSERT FAILED: ${name} should have been rejected`);
}
async function newClaim(text) {
  const id = Number(await read(cA, cfg, "get_claim_count"));
  await step(`publish #${id}`, cA, "publish", [text, QUOTE, URL_], BOND);
  const rec = await claim(id);
  assert(rec.status === "open" && rec.evidence_hash.length === 64 && rec.evidence_excerpt.length > 0, "snapshot stored at publish");
  return id;
}
async function withdraw(name, client, acct, expected) {
  assert((await credit(acct)) === expected, `${name}: credit ${fromWei(await credit(acct), 6)} != ${fromWei(expected, 6)}`);
  const before = await bal(acct.address);
  await step(name, client, "withdraw");
  assert((await credit(acct)) === 0n, `${name}: credit not cleared`);
  const gained = (await bal(acct.address)) - before;
  rows.push({ name: `${name}: wallet delta GEN (after fees)`, hash: fromWei(gained, 6) });
  assert(gained > 0n, `${name}: wallet balance did not increase`);
}
const cfgInfo = JSON.parse(await read(cA, cfg, "get_config"));
console.log("contract config:", cfgInfo);

// 1. input validation is enforced by the contract
await expectFail("publish with quote not on the page", cA, "publish", ["bad", "this sentence is definitely not on that page 9f3k2", URL_], BOND);
await expectFail("publish with zero bond", cA, "publish", ["bad", QUOTE, URL_], 0n);
await expectFail("publish with http url", cA, "publish", ["bad", QUOTE, "http://example.com"], BOND);

// 2. cancel an uncontested claim and recover the bond
let id = await newClaim("E2E: cancel path");
await expectFail(`challenge own claim #${id}`, cA, "challenge", [id], BOND);
await step(`cancel #${id}`, cA, "cancel", [id]);
assert((await claim(id)).status === "cancelled", "cancel status");
await withdraw("withdraw after cancel", cA, A, BOND);

// 3. mutual refund of a challenged claim
id = await newClaim("E2E: mutual refund path");
await step(`challenge #${id}`, cB, "challenge", [id], BOND);
assert((await claim(id)).challenged_at > 0, "challenge timestamp stored (needed for timeout recovery)");
await step(`refund request A #${id}`, cA, "request_refund", [id]);
await step(`refund request B #${id}`, cB, "request_refund", [id]);
assert((await claim(id)).status === "refunded", "refund status");
await withdraw("A withdraw after refund", cA, A, BOND);
await withdraw("B withdraw after refund", cB, B, BOND);

// 4. validator resolution against the stored snapshot, payout to the right side
id = await newClaim("E2E: the source page says this exact phrase");
const snap = await claim(id);
await step(`challenge #${id}`, cB, "challenge", [id], BOND);
await step(`resolve #${id}`, cA, "resolve", [id]);
const done = await claim(id);
assert(["supported", "unsupported", "inconclusive"].includes(done.status), `verdict ${done.status}`);
assert(done.evidence_hash === snap.evidence_hash, "evidence unchanged by resolve");
console.log("verdict:", done.status, "evidence sha256:", done.evidence_hash);
rows.push({ name: `verdict #${id}`, hash: `${done.status} (evidence ${done.evidence_hash.slice(0, 16)}…)` });
if (done.status === "supported") await withdraw("A withdraw winnings", cA, A, BOND * 2n);
else if (done.status === "unsupported") await withdraw("B withdraw winnings", cB, B, BOND * 2n);
else { await withdraw("A withdraw refund", cA, A, BOND); await withdraw("B withdraw refund", cB, B, BOND); }

// 5. optional: timeout recovery (contract must be deployed with a short RESOLVE_TIMEOUT_SECONDS, e.g. 60)
if (process.env.E2E_EXPIRY) {
  id = await newClaim("E2E: timeout path");
  await step(`challenge #${id}`, cB, "challenge", [id], BOND);
  await expectFail(`reclaim before timeout #${id}`, cA, "reclaim_expired", [id]);
  const wait = cfgInfo.resolve_timeout_seconds + 30;
  console.log(`waiting ${wait}s for the timeout…`); await new Promise((r) => setTimeout(r, wait * 1000));
  await step(`reclaim_expired #${id}`, cA, "reclaim_expired", [id]);
  assert((await claim(id)).status === "expired", "expired status");
  await withdraw("A withdraw after timeout", cA, A, BOND);
  await withdraw("B withdraw after timeout", cB, B, BOND);
}

fs.mkdirSync("runs", { recursive: true });
const md = `Contract ${cfg.address} (version ${cfgInfo.version}, resolve timeout ${cfgInfo.resolve_timeout_seconds}s)\n\n| step | tx hash / value |\n|---|---|\n` + rows.map((r) => `| ${r.name} | ${r.hash} |`).join("\n") + "\n";
fs.writeFileSync("runs/e2e-report.md", md);
console.log("\n" + md + "\nAll assertions passed. Now confirm each hash in the explorer shows accepted/finalized with FINISHED_WITH_RETURN.");
