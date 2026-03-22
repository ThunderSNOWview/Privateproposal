import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const idl = JSON.parse(fs.readFileSync("./target/idl/private_voting.json", "utf8"));
const walletFile = "./scripts/test-voter.json";
const walletData = JSON.parse(fs.readFileSync(walletFile, "utf8"));
const keypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(walletData));
const wallet = new anchor.Wallet(keypair);

const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new anchor.Program(idl, provider);

async function main() {
  console.log("Voter:", keypair.publicKey.toBase58());
  const [vcPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("voter_credits"), keypair.publicKey.toBuffer()],
    program.programId
  );
  console.log("PDA:", vcPda.toBase58());

  try {
    const tx = await program.methods
      .registerVoter()
      .accounts({
        voter: keypair.publicKey,
        voterCredits: vcPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Registration Successful! TX:", tx);
  } catch (err) {
    console.error("Registration Failed:", err);
    process.exit(1);
  }
}

main().catch(console.error);
