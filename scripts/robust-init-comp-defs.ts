import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { 
  getArciumProgram, 
  getCompDefAccOffset, 
  getCompDefAccAddress,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as path from "path";

anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider() as anchor.AnchorProvider;
const arciumProgram = getArciumProgram(provider);

const APP_ID = new PublicKey("Aiqd5dMHe1GNrxCpnMZTgcxpmkPN2335ysfCsJgspUSa");
const MAX_CHUNK_SIZE = 800; // conservative

async function uploadManual(name: string, circuitPath: string) {
  const binary = fs.readFileSync(path.join(process.cwd(), circuitPath));
  console.log(`\nUploading ${name} (${binary.length} bytes)...`);

  const offset = Buffer.from(getCompDefAccOffset(name)).readUInt32LE();
  const compDefAddr = getCompDefAccAddress(APP_ID, offset);

  // Check if finalized
  try {
    const data = await arciumProgram.account.computationDefinitionAccount.fetch(compDefAddr);
    const source = (data.circuitSource as any).onChain;
    if (source && source[0] && source[0].isCompleted) {
        console.log(`  ✓ ${name} already finalized.`);
        return;
    }
  } catch {}

  const chunks: Buffer[] = [];
  for (let i = 0; i < binary.length; i += MAX_CHUNK_SIZE) {
    chunks.push(binary.slice(i, i + MAX_CHUNK_SIZE));
  }
  console.log(`  Divided into ${chunks.length} chunks.`);

  for (let i = 0; i < chunks.length; i++) {
    let success = false;
    let retries = 5;
    while (!success && retries > 0) {
      try {
        process.stdout.write(`  Chunk ${i+1}/${chunks.length}... `);
        const sig = await arciumProgram.methods
          .uploadCircuitPart(i, chunks[i] as any)
          .accounts({
            compDefAccount: compDefAddr,
            signer: provider.wallet.publicKey,
          } as any)
          .rpc();
        console.log(`OK (${sig.slice(0, 8)}...)`);
        success = true;
        // Small delay to avoid 429
        await new Promise(r => setTimeout(r, 600));
      } catch (e: any) {
        console.log(`FAIL: ${e.message.slice(0, 50)}...`);
        retries--;
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    if (!success) throw new Error(`Failed to upload chunk ${i} after retries`);
  }

  console.log(`  Finalizing ${name}...`);
  await arciumProgram.methods
    .finalizeCircuit()
    .accounts({
      compDefAccount: compDefAddr,
      signer: provider.wallet.publicKey,
    } as any)
    .rpc();
  console.log(`  ✓ ${name} finalized!`);
}

async function main() {
  await uploadManual("init_tally", "circuits/init_tally.bin");
  await uploadManual("add_vote", "circuits/add_vote.bin");
  await uploadManual("reveal_tally", "circuits/reveal_tally.bin");
}

main().catch(console.error);
