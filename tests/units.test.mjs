import test from "node:test";
import assert from "node:assert/strict";
import { toWei, fromWei, plain, short, same } from "../lib/units.js";

test("toWei / fromWei round-trip", () => {
  assert.equal(toWei("5"), 5n * 10n ** 18n);
  assert.equal(toWei("0.5"), 5n * 10n ** 17n);
  assert.equal(fromWei(toWei("1.25")), "1.25");
  assert.equal(fromWei(0), "0");
});
test("toWei rejects bad input", () => {
  assert.throws(() => toWei("abc"));
  assert.throws(() => toWei("0"));
});
test("plain converts nested Maps", () => {
  assert.deepEqual(plain(new Map([["a", new Map([["b", 1]])]])), { a: { b: 1 } });
});
test("address helpers", () => {
  assert.equal(short("0x1234567890abcdef1234"), "0x1234…1234");
  assert.ok(same("0xAB", "0xab"));
});
