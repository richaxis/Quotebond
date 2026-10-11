// Phase timeouts (leader/validator time units) must stay inside 30..600 or the network reverts
// with PhaseTimeoutOutOfBounds. lib/fees.js clamps them.
// Fee budgets per method (consensus v0.6). Shape matches `gltest --fee-profile` output.
// These are generous STARTING values taken from the docs' sample profile, not measured numbers.
// executionBudgetPerRound is left out on purpose: the SDK then adds its own receipt-gas floor.
// (Passing a number below that floor causes BudgetTooLow.) Unused fee budget is refunded at finalization. Replace with a measured profile when you can:
//   python3 -m pytest tests/integration --fee-profile lib/fee-profile.json
const base = { leaderTimeunitsAllocation: "125", validatorTimeunitsAllocation: "250", totalMessageFees: "0", rotationsPerRound: "1" };

export default {
  version: 1,
  network: "studio-next",
  deploy: { ...base },
  methods: {
    // publish fetches the source page on every validator: give it the most time (max allowed is 600)
    publish: { ...base, leaderTimeunitsAllocation: "500", validatorTimeunitsAllocation: "600" },
    reclaim_expired: { ...base },
    cancel: { ...base },
    request_refund: { ...base },
    challenge: { ...base },
    // resolve calls an LLM on every validator
    resolve: { ...base, leaderTimeunitsAllocation: "500", validatorTimeunitsAllocation: "600" },
    // withdraw emits a transfer message, so it needs a message budget
    withdraw: { ...base, totalMessageFees: "800000" },
  },
};
