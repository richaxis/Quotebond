# Protocol
1. `publish(claim, quote, url)` payable: bond = value sent. Status `open`.
2. `challenge(id)` payable: stake must equal the bond exactly. Status `challenged`.
3. `resolve(id)`: validators judge the claim against the evidence excerpt stored at publish time (they do not re-fetch the page). The LLM answers one word and consensus uses `strict_eq`.
4. Payout credits: supported -> author gets pool; unsupported -> challenger gets pool; inconclusive -> each gets their own money back.
5. `withdraw()` pays the caller's credits (credits are zeroed before the transfer).

## Evidence (v3)
`publish` is validated by consensus: validators fetch the source page, check the exact quote is on it, and agree on a normalized excerpt (300 characters either side). The contract stores that excerpt and its SHA-256 (`evidence_hash`), plus `quote_hash` and `published_at`. A quote that is not on the page cannot be posted, and the bond is returned when the call reverts.
`resolve` judges the claim against the STORED excerpt, never the live page, so later edits to the page cannot change who gets paid.

## Escrow recovery (v3)
- `cancel(id)`: author recovers the bond while nobody has challenged (no waiting period).
- `request_refund(id)`: both parties of a challenged claim ask, both are refunded.
- `reclaim_expired(id)`: once `resolve_timeout` seconds have passed since the challenge (default 24 h when the deploy argument is 0 or empty; otherwise 60 s to 30 days), anyone can refund both sides. Time comes from `gl.message_raw["datetime"]` with integer math.
- An LLM error at resolve returns "inconclusive" (refund) instead of reverting.
- Refunds, winnings and cancellations are credited, then paid by `withdraw()`, which zeroes the credit before transferring.

## Validation
Claim 1-300 chars, quote 8-500 chars, https URL under 300 chars with no spaces, non-zero bond, challenge stake equals the bond, the author cannot challenge their own claim, unknown ids are rejected, and the model's answer is parsed strictly (anything unclear is "inconclusive").
