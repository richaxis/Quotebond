import { createClient } from "genlayer-js";
import * as chains from "genlayer-js/chains";
import { quoteFees, isBudgetTooLow } from "./fees.js";
import { TransactionStatus } from "genlayer-js/types";
import { plain } from "./units.js";
export * from "./units.js";

export function makeConfig(env = {}) {
  return {
    address: env.VITE_CONTRACT_ADDRESS || "",
    rpc: env.VITE_RPC_URL || "https://studio-next.genlayer.com/api",
    chainId: Number(env.VITE_CHAIN_ID || 61997),
    explorer: env.VITE_EXPLORER_URL || "https://explorer-studio-dev.genlayer.com/",
  };
}

// Use the chain definition shipped with the v2 RC: chain id and consensus contract addresses
// must stay together, so we only override the RPC and explorer, never the id or addresses.
export function makeChain(cfg) {
  const base = chains.studioNext ?? chains.studioDevnet ?? chains.studionet;
  return {
    ...base,
    name: "GenLayer Studio Next",
    rpcUrls: { default: { http: [cfg.rpc] } },
    blockExplorers: { default: { name: "Explorer", url: cfg.explorer } },
  };
}

const chainHex = (cfg) => "0x" + cfg.chainId.toString(16);

// Makes sure the wallet is on Studio Next; asks the wallet to ADD the network if it doesn't know it.
export async function ensureChain(cfg) {
  const eth = window.ethereum;
  if (!eth) throw new Error("No browser wallet found. Install MetaMask or Rabby.");
  if ((await eth.request({ method: "eth_chainId" })).toLowerCase() === chainHex(cfg)) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex(cfg) }] });
  } catch (e) {
    if (e.code === 4001) throw new Error("You rejected the network switch.");
    // 4902 = unknown chain; some wallets use -32603 or a message instead
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: chainHex(cfg), chainName: "GenLayer Studio Next", rpcUrls: [cfg.rpc],
        nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 }, blockExplorerUrls: [cfg.explorer] }],
    });
  }
}

// fresh = true forces the wallet's account picker, so you can choose a different account.
export async function connectWallet(cfg, fresh = false) {
  const eth = window.ethereum;
  if (!eth) throw new Error("No browser wallet found. Install MetaMask or Rabby.");
  if (fresh) {
    try { await eth.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] }); }
    catch (e) { if (e.code === 4001) throw new Error("Connection rejected."); }
  }
  const [account] = await eth.request({ method: "eth_requestAccounts" });
  await ensureChain(cfg);
  return account;
}

// Sites cannot force-disconnect a wallet, but we can revoke this site's permission where supported.
export async function disconnectWallet() {
  try { await window.ethereum?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }); } catch {}
}

// Account is optional: reads work without a wallet, writes are signed by the wallet.
export const makeClient = (cfg, account) =>
  createClient({ chain: makeChain(cfg), ...(account ? { account } : {}) });

export const read = (client, cfg, functionName, args = []) =>
  client.readContract({ address: cfg.address, functionName, args }).then(plain);

const jsonSafe = (_, v) => (typeof v === "bigint" ? v.toString() : v);

export async function write(client, cfg, functionName, args = [], value = 0n) {
  // The revert can surface when sending OR when waiting for the receipt (your screenshot shows a tx hash).
  // On BudgetTooLow, retry with bigger budgets; unused fee is refunded at finalization.
  let lastError;
  for (const scale of [1n, 4n, 16n]) {
    try {
      const fees = await quoteFees(client, functionName, scale);
      const hash = await client.writeContract({ address: cfg.address, functionName, args, value, fees });
      const receipt = await client.waitForTransactionReceipt({
        hash, status: TransactionStatus.ACCEPTED, retries: 120, interval: 5000,
      });
      // ACCEPTED does not prove the contract ran successfully: check the execution result too.
      const dump = JSON.stringify(receipt, jsonSafe);
      if (/FINISHED_WITH_ERROR/.test(dump)) {
        const reason = (dump.match(/\\?"message\\?"\s*:\s*\\?"([^"\\]{3,200})/) || [])[1];
        const err = new Error(`Contract rejected ${functionName}${reason ? ": " + reason : ""} (tx ${hash.slice(0, 12)}…)`);
        err.hash = hash; err.reason = reason; err.receipt = receipt;
        throw err;
      }
      return { hash, receipt };
    } catch (e) {
      lastError = e;
      if (!isBudgetTooLow(e)) throw e;
    }
  }
  throw lastError;
}

export async function loadClaims(client, cfg) {
  const count = Number(await read(client, cfg, "get_claim_count"));
  const ids = Array.from({ length: count }, (_, i) => i);
  return Promise.all(ids.map(async (id) => ({ id, ...JSON.parse(await read(client, cfg, "get_claim", [id])) })));
}
