# Production status

Record only what you have verified. A submitted transaction is not success: check finalization, execution result and contract state.

- [x] Contract static checks (`make -C chain-and-site test`)
- [x] Unit tests for wei/format helpers (`npm test`)
- [ ] `npm run build` verified with real dependencies installed
- [ ] Contract v3.0.3 deployed to Studio Next (address: ____, tx: ____); same address set in Vercel env and public/deployment.json
- [ ] `E2E_EXPIRY=1 npm run e2e` against a contract deployed with RESOLVE_TIMEOUT_SECONDS=60 (timeout recovery)
- [ ] `npm run e2e` passed (cancel, mutual refund, resolve, withdraw) and report pasted into docs/EVIDENCE.md
- [ ] publish / challenge / resolve / withdraw each executed once on Studio Next (tx hashes: ____)
- [ ] Vercel deployment URL: ____

Known limits: no claim deadline; the verdict is validator consensus on one page snapshot; page content that changes between validators may produce disagreement.
