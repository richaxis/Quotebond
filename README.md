# Quotebond

A bonded market on whether a cited source really supports a claim, built on GenLayer.
Authors post a claim, the exact quote and a source URL with a bond. A challenger matches the bond.
GenLayer validators fetch the page and reach consensus on one word: supported, unsupported or inconclusive.
The winner takes the pool; an inconclusive verdict refunds both sides.

This is behavioural testimony from validator consensus on a page snapshot. It is not proof the page is true.

- Contract: `chain-and-site/contracts/quotebond.py`
- Network: GenLayer Studio Next, chain 61997, RPC https://studio-next.genlayer.com/api
- Explorer: https://explorer-studio-dev.genlayer.com/

## Run locally
```
npm install
cp .env.example .env        # set VITE_CONTRACT_ADDRESS after deploying
make -C chain-and-site test
npm test
npm run dev
```

## Deploy the contract
```
DEPLOYER_PRIVATE_KEY=0x... RESOLVE_TIMEOUT_SECONDS=86400 npm run deploy:contract
```
Use a funded Studio Next test account. Copy the printed address into `.env` and `public/deployment.json`.
If the script cannot find the address, open the printed tx hash in the explorer.

## Deploy the site to Vercel
1. Push this repo to GitHub.
2. Vercel > Add New > Project > import the repo. Framework: Vite (vercel.json sets build `npm run build`, output `dist`).
3. Add environment variables: `VITE_CONTRACT_ADDRESS`, `VITE_RPC_URL`, `VITE_CHAIN_ID=61997`, `VITE_EXPLORER_URL`.
4. Deploy. Never add `DEPLOYER_PRIVATE_KEY` to Vercel.
5. Redeploy after changing any VITE_ variable (they are baked in at build time).

CLI alternative: `npm i -g vercel && vercel --prod`.

## Fees (Studio Next / consensus v0.6)
Every write and deploy must carry a fee deposit. The app quotes it with `client.estimateTransactionFees` using
the budgets in `lib/fee-profile.js` and submits the returned `distribution` and `feeValue` unchanged.
Your wallet needs enough GEN for the bond **plus** the fee deposit; unused fee is refunded at finalization.
The budgets are starting values: generate a measured profile with `gltest --fee-profile` when you can.
Error `FeeValueMustBeNonZero` means a transaction was sent without fees.

## Verify end to end
```
VITE_CONTRACT_ADDRESS=0x... KEY_A=0x... KEY_B=0x... npm run e2e
```
Covers input validation, cancel, mutual refund, validator resolution with the stored evidence snapshot, withdrawals and wallet balance changes. Add `E2E_EXPIRY=1` (contract deployed with `RESOLVE_TIMEOUT_SECONDS=60`) to test timeout recovery.
Phase timeouts are clamped to the network range 30-600 in `lib/fees.js`.
