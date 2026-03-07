/**
 * reset-and-reupload-add-vote.ts
 *
 * Resets the add_vote computation definition (clears isCompleted),
 * then re-uploads the updated circuit bytes and re-finalizes.
 *
 * Run from private-voting/ root:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   yarn ts-node scripts/reset-and-reupload-add-vote.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import * as fs from "fs";
import {
  getArciumProgram,
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
} from "@arcium-hq/client";
import { PrivateVoting } from "../target/types/private_voting";
import idl from "../target/idl/private_voting.json";

anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider() as anchor.AnchorProvider;
const program = new anchor.Program(idl as anchor.Idl, provider) as unknown as anchor.Program<PrivateVoting>;
const arciumProgram = getArciumProgram(provider);

const MXE_PROGRAM_ID = new PublicKey("CLUBgAStu51VNK9BWaDujZYvrM55MAmfq7CLZ3KY3mmD");
const MAX_UPLOAD_PER_TX_BYTES = 814;
const MAX_REALLOC_PER_IX = 10240;
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

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function sendTxWithRetry(tx: Transaction, maxRetries = 5): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const bh = await provider.connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = bh.blockhash;
      tx.lastValidBlockHeight = bh.lastValidBlockHeight;
      tx.feePayer = provider.wallet.publicKey;
      const signed = await provider.wallet.signTransaction(tx);
      const sig = await provider.connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
      await provider.connection.confirmTransaction(
        { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed"
      );
      return sig;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (attempt < maxRetries - 1 && (msg.includes("Blockhash") || msg.includes("429"))) {
        await sleep(1000 * (attempt + 1)); continue;
      }
      throw e;
    }
  }
  throw new Error("exhausted");
}

async function main() {
  console.log(`Program: ${MXE_PROGRAM_ID.toBase58()}`);
  console.log(`Payer:   ${provider.wallet.publicKey.toBase58()}`);

  const name = "add_vote";
  const offset = compDefOffsetNum(name);
  const compDefPubkey = getCompDefAccAddress(MXE_PROGRAM_ID, offset);
  const rawCircuitPda = getRawCircuitPda(compDefPubkey);
  const rawCircuit = fs.readFileSync(`build/${name}.arcis`);

  console.log(`\nCircuit size: ${rawCircuit.length} bytes`);

  const mxeAcc = await arciumProgram.account.mxeAccount.fetch(getMXEAccAddress(MXE_PROGRAM_ID));
  const lutAddress = getLookupTableAddress(MXE_PROGRAM_ID, mxeAcc.lutOffsetSlot);

  // Step 1: Re-call initAddVoteCompDef. Arcium uses init_if_needed for comp defs,
  // so this resets the circuit to "pending" state even if already finalized.
  console.log("\nStep 1: Resetting comp def via initAddVoteCompDef...");
  try {
    const sig = await (program.methods as any).initAddVoteCompDef()
      .accountsPartial({
        payer: provider.wallet.publicKey,
        mxeAccount: getMXEAccAddress(MXE_PROGRAM_ID),
        compDefAccount: compDefPubkey,
        addressLookupTable: lutAddress,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    console.log("  sig:", sig);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const logs = e?.logs ?? [];
    console.log("  initAddVoteCompDef error:", msg);
    if (logs.length) console.log("  logs:", logs.slice(-4).join("\n"));
  }

  const cdAfterReset = await arciumProgram.account.computationDefinitionAccount.fetch(compDefPubkey);
  console.log("  circuitSource after reset:", JSON.stringify(cdAfterReset.circuitSource));

  const isStillCompleted =
    "onChain" in (cdAfterReset.circuitSource as any) &&
    (cdAfterReset.circuitSource as any).onChain?.[0]?.isCompleted;

  if (isStillCompleted) {
    console.log("\n  ⚠ Comp def still marked as completed.");
    console.log("  The Arcium program does not allow resetting finalized circuits.");
    console.log("  The old add_vote circuit remains active. Direction clamping will not be in effect.");
    console.log("  (This is safe for devnet; the fix will apply on the next fresh MXE deployment.)");
    process.exit(0);
  }

  // Step 2: Ensure raw circuit account exists and is big enough
  console.log("\nStep 2: Checking raw circuit account size...");
  const onChainAcc = await provider.connection.getAccountInfo(rawCircuitPda);
  const currentBytes = onChainAcc ? onChainAcc.data.length : 0;
  const requiredBytes = rawCircuit.length + 9;

  if (!onChainAcc) {
    console.log("  Initializing raw circuit account...");
    await arciumProgram.methods.initRawCircuitAcc(offset, MXE_PROGRAM_ID, 0)
      .accounts({ signer: provider.wallet.publicKey })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    console.log("  ✓ initialized");
  } else if (currentBytes < requiredBytes) {
    const delta = requiredBytes - currentBytes;
    const ixCount = Math.ceil(delta / MAX_REALLOC_PER_IX);
    const txCount = Math.ceil(ixCount / MAX_RESIZE_IXS_PER_TX);
    console.log(`  Resizing ${currentBytes} → ${requiredBytes} bytes...`);
    const ix = await arciumProgram.methods.embiggenRawCircuitAcc(offset, MXE_PROGRAM_ID, 0)
      .accounts({ signer: provider.wallet.publicKey }).instruction();
    let rem = ixCount;
    for (let t = 0; t < txCount; t++) {
      const batch = Math.min(rem, MAX_RESIZE_IXS_PER_TX);
      const tx = new Transaction();
      for (let i = 0; i < batch; i++) tx.add(ix);
      await sendTxWithRetry(tx);
      rem -= batch;
    }
    console.log("  ✓ resized");
  } else {
    console.log("  Size OK");
  }

  // Step 3: Upload all chunks
  const totalTxs = Math.ceil(rawCircuit.length / MAX_UPLOAD_PER_TX_BYTES);
  console.log(`\nStep 3: Uploading ${totalTxs} chunks...`);
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
    if ((i + 1) % 50 === 0) console.log(`  Progress: ${i + 1}/${totalTxs}`);
  }
  console.log("  ✓ all chunks uploaded");

  // Step 4: Finalize
  console.log("\nStep 4: Finalizing...");
  const finalizeTx = await (arciumProgram.methods as any)
    .finalizeComputationDefinition(offset, MXE_PROGRAM_ID)
    .accounts({ signer: provider.wallet.publicKey })
    .transaction();
  await sendTxWithRetry(finalizeTx);
  console.log("  ✓ finalized");

  console.log("\n✓ add_vote circuit updated successfully!");
}

main().catch(err => { console.error(err); process.exit(1); });
