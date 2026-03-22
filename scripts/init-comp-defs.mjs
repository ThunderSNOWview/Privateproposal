console.log("TOP OF SCRIPT");
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import {
  getArciumProgram,
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
  uploadCircuit,
} from "@arcium-hq/client";

console.log(">>> PURE ESM INITIALIZATION SCRIPT STARTED <<<");

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Load IDL via fs
const idl = JSON.parse(fs.readFileSync("./target/idl/private_voting.json", "utf-8"));

anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider();
const program = new anchor.Program(idl, provider);
const arciumProgram = getArciumProgram(provider);

function compDefOffsetNum(name) {
  return Buffer.from(getCompDefAccOffset(name)).readUInt32LE();
}

async function getLutAddress() {
  const mxeAccount = getMXEAccAddress(program.programId);
  const mxeAcc = await arciumProgram.account.mxeAccount.fetch(mxeAccount);
  return getLookupTableAddress(program.programId, mxeAcc.lutOffsetSlot);
}

async function initCompDef(name, methodName) {
  console.log(`\nInitializing ${name} computation definition...`);

  const compDefPubkey = getCompDefAccAddress(program.programId, compDefOffsetNum(name));
  const existing = await provider.connection.getAccountInfo(compDefPubkey);

  if (existing !== null) {
    console.log(`  (comp def account already exists — skipping init)`);
  } else {
    const lutAddress = await getLutAddress();
    await program.methods[methodName]()
      .accounts({
        payer: provider.wallet.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
        compDefAccount: compDefPubkey,
        addressLookupTable: lutAddress,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    console.log(`  ✓ ${name} comp def initialized`);
  }

  const rawCircuit = fs.readFileSync(`build/${name}.arcis`);
  let retries = 5;
  while (retries > 0) {
    try {
      await uploadCircuit(provider, name, program.programId, rawCircuit, true, 5, {
        skipPreflight: true,
        commitment: "confirmed",
      });
      console.log(`  ✓ ${name} circuit uploaded`);
      return;
    } catch (e) {
      retries--;
      const logs = e?.transactionLogs ?? e?.logs ?? null;
      console.error(`  uploadCircuit failed for ${name} (retries left: ${retries}):`, e?.transactionMessage ?? e?.message ?? e);
      if (logs) console.error("  Logs:", logs);
      if (retries === 0) throw e;
      console.log(`  Retrying in 5 seconds...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function main() {
  console.log(`Program: ${program.programId.toBase58()}`);
  console.log(`Payer:   ${provider.wallet.publicKey.toBase58()}`);
  console.log(`Cluster: ${provider.connection.rpcEndpoint}`);

  await initCompDef("init_tally", "initZeroTallyCompDef");
  await initCompDef("add_vote", "initAddVoteCompDef");
  await initCompDef("reveal_tally", "initRevealTallyCompDef");

  console.log("\nAll computation definitions initialized successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
