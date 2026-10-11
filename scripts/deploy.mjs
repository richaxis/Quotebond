// Deploys chain-and-site/contracts/quotebond.py to Studio Next.
// Usage: DEPLOYER_PRIVATE_KEY=0x... [RESOLVE_TIMEOUT_SECONDS=86400] npm run deploy:contract
import fs from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import { makeConfig, makeChain } from "../lib/chain.js";
import { quoteFees } from "../lib/fees.js";

const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key) throw new Error("Set DEPLOYER_PRIVATE_KEY (a funded Studio Next test account)");
const cfg = makeConfig({ VITE_RPC_URL: process.env.VITE_RPC_URL, VITE_CHAIN_ID: process.env.VITE_CHAIN_ID });
const client = createClient({ chain: makeChain(cfg), account: createAccount(key) });
const code = fs.readFileSync(new URL("../chain-and-site/contracts/quotebond.py", import.meta.url), "utf8");

const fees = await quoteFees(client, "deploy");
const timeout = Number(process.env.RESOLVE_TIMEOUT_SECONDS || 86400); // 60 .. 2592000
console.log("resolve timeout (seconds):", timeout);
const hash = await client.deployContract({ code, args: [timeout], leaderOnly: false, fees });
fs.mkdirSync("runs", { recursive: true });
fs.appendFileSync("runs/transactions.jsonl", JSON.stringify({ kind: "deploy", hash, at: new Date().toISOString() }) + "\n");
console.log("deploy tx:", hash);
const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, retries: 120, interval: 5000 });
const address = receipt?.data?.contract_address ?? receipt?.txDataDecoded?.contractAddress;
console.log(address ? `contract address: ${address}` : "Address not found in receipt: open the tx in the explorer and copy it.");
console.log("A submission is not success: confirm the execution result in the explorer.");
