/**
 * reupload-add-vote.ts
 *
 * Force re-uploads the add_vote circuit after its content changed.
 * Unlike fix-circuits.ts, this does NOT skip already-finalized circuits.
 *
 * Run from private-voting/ root:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   yarn ts-node scripts/reupload-add-vote.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import * as fs from "fs";
import {
  getArciumProgram,
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
} from "@arcium-hq/client";
import { PrivateVoting } from "../target/types/private_voting";
import idl from "../target/idl/private_voting.json";

anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider() as anchor.AnchorProvider;
const program = new anchor.Program(idl as anchor.Idl, provider) as unknown as anchor.Program<PrivateVoting>;
const arciumProgram = getArciumProgram(provider);

const MXE_PROGRAM_ID = new PublicKey("CLUBgAStu51VNK9BWaDujZYvrM55MAmfq7CLZ3KY3mmD");
const MAX_REALLOC_PER_IX = 10240;
const MAX_UPLOAD_PER_TX_BYTES = 814;
const MAX_RESIZE_IXS_PER_TX = 18;

function compDefOffsetNum(name: string): number {
  return Buffer.from(getCompDefAccOffset(name)).readUInt32LE();
}

function getRawCircuitPda(compDefPubkey: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ComputationDefinitionRaw"), compDefPubkey.toBuffer(), Buffer.from([0])],
    arciumProgram.programId
  );
  return pda;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendTxWithRetry(tx: Transaction, maxRetries = 5): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const blockInfo = await provider.connection.getLatestBlockhash({ commitment: "confirmed" });
      tx.recentBlockhash = blockInfo.blockhash;
      tx.lastValidBlockHeight = blockInfo.lastValidBlockHeight;
      tx.feePayer = provider.wallet.publicKey;
      const signed = await provider.wallet.signTransaction(tx);
      const sig = await provider.connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
      await provider.connection.confirmTransaction(
        { signature: sig, blockhash: blockInfo.blockhash, lastValidBlockHeight: blockInfo.lastValidBlockHeight },
        "confirmed"
      );
      return sig;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (attempt < maxRetries - 1 && (msg.includes("Blockhash") || msg.includes("429"))) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw new Error("sendTxWithRetry exhausted");
}

async function resizeIfNeeded(offset: number, compDefPubkey: PublicKey, currentBytes: number, requiredBytes: number) {
  const delta = requiredBytes - currentBytes;
  if (delta <= 0) { console.log("  Size OK"); return; }
  const ixCount = Math.ceil(delta / MAX_REALLOC_PER_IX);
  const txCount = Math.ceil(ixCount / MAX_RESIZE_IXS_PER_TX);
  console.log(`  Resizing ${currentBytes} → ${requiredBytes} bytes (${ixCount} IXs / ${txCount} txs)`);
  const ix = await arciumProgram.methods
    .embiggenRawCircuitAcc(offset, MXE_PROGRAM_ID, 0)
    .accounts({ signer: provider.wallet.publicKey })
    .instruction();
  let remaining = ixCount;
  for (let t = 0; t < txCount; t++) {
    const batch = Math.min(remaining, MAX_RESIZE_IXS_PER_TX);
    const tx = new Transaction();
    for (let i = 0; i < batch; i++) tx.add(ix);
    await sendTxWithRetry(tx);
    remaining -= batch;
  }
  console.log("  ✓ Resize done");
}

async function uploadAllChunks(offset: number, rawCircuit: Buffer) {
  const totalTxs = Math.ceil(rawCircuit.length / MAX_UPLOAD_PER_TX_BYTES);
  console.log(`  Uploading ${totalTxs} chunks...`);
  for (let i = 0; i < totalTxs; i++) {
    const byteOffset = i * MAX_UPLOAD_PER_TX_BYTES;
    const chunk = rawCircuit.subarray(byteOffset, byteOffset + MAX_UPLOAD_PER_TX_BYTES);
    const padded = Buffer.alloc(MAX_UPLOAD_PER_TX_BYTES);
    chunk.copy(padded);

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await (arciumProgram.methods as any)
          .uploadCircuit(offset, MXE_PROGRAM_ID, 0, Array.from(padded), byteOffset)
          .accounts({ signer: provider.wallet.publicKey })
          .rpc({ commitment: "confirmed", skipPreflight: false });
        break;
      } catch (e: any) {
        const msg: string = e?.transactionMessage ?? e?.message ?? String(e);
        if (msg.includes("429") || msg.includes("Too Many")) { await sleep(2000 * (attempt + 1)); continue; }
        if (msg.includes("Blockhash")) { await sleep(500); continue; }
        throw e;
      }
    }
    if ((i + 1) % 20 === 0) console.log(`  Progress: ${i + 1}/${totalTxs}`);
  }
  console.log(`  ✓ All chunks uploaded`);
}

async function main() {
  console.log(`Program: ${MXE_PROGRAM_ID.toBase58()}`);
  console.log(`Payer:   ${provider.wallet.publicKey.toBase58()}`);
  console.log("\n=== Force re-uploading add_vote circuit ===");

  const name = "add_vote";
  const offset = compDefOffsetNum(name);
  const compDefPubkey = getCompDefAccAddress(MXE_PROGRAM_ID, offset);
  const rawCircuitPda = getRawCircuitPda(compDefPubkey);
  const rawCircuit = fs.readFileSync(`build/${name}.arcis`);
  console.log(`  Circuit size: ${rawCircuit.length} bytes`);

  // Ensure comp def exists
  const compDefAcc = await arciumProgram.account.computationDefinitionAccount.fetch(compDefPubkey).catch(() => null);
  if (!compDefAcc) {
    console.log("  Comp def missing — initializing...");
    const mxeAcc = await arciumProgram.account.mxeAccount.fetch(getMXEAccAddress(MXE_PROGRAM_ID));
    const { getLookupTableAddress } = await import("@arcium-hq/client");
    const lutAddress = getLookupTableAddress(MXE_PROGRAM_ID, mxeAcc.lutOffsetSlot);
    await (program.methods as any)
      .initAddVoteCompDef()
      .accounts({
        payer: provider.wallet.publicKey,
        mxeAccount: getMXEAccAddress(MXE_PROGRAM_ID),
        compDefAccount: compDefPubkey,
        addressLookupTable: lutAddress,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    console.log("  ✓ Comp def initialized");
  } else {
    console.log("  Comp def exists — proceeding with force re-upload");
  }

  // Ensure raw circuit account exists and is big enough
  const onChainAcc = await provider.connection.getAccountInfo(rawCircuitPda);
  const currentBytes = onChainAcc ? onChainAcc.data.length : 0;
  const requiredBytes = rawCircuit.length + 9;

  if (!onChainAcc) {
    console.log("  Initializing raw circuit account...");
    await arciumProgram.methods
      .initRawCircuitAcc(offset, MXE_PROGRAM_ID, 0)
      .accounts({ signer: provider.wallet.publicKey })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    console.log("  ✓ Raw circuit account initialized");
  }

  await resizeIfNeeded(offset, compDefPubkey, currentBytes, requiredBytes);
  await uploadAllChunks(offset, rawCircuit);

  // Finalize (re-finalize if already done — Arcium allows this to update circuit hash)
  console.log("  Finalizing...");
  const tx = await (arciumProgram.methods as any)
    .finalizeComputationDefinition(offset, MXE_PROGRAM_ID)
    .accounts({ signer: provider.wallet.publicKey })
    .transaction();
  await sendTxWithRetry(tx);
  console.log("  ✓ Finalized");

  console.log("\n✓ add_vote circuit re-uploaded successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
