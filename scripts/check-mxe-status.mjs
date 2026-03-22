import * as anchor from "@coral-xyz/anchor";
import { getMXEAccAddress, getArciumProgram } from "@arcium-hq/client";

const programId = new anchor.web3.PublicKey("8bXD7RRyNSxjWJdjzTZNmdpowq4NhafLfHNUXMGge1Ri");
const provider = anchor.AnchorProvider.env();
const arciumProgram = getArciumProgram(provider);

async function main() {
  const mxeAddr = getMXEAccAddress(programId);
  console.log("MXE Address:", mxeAddr.toBase58());
  
  const mxeAcc = await arciumProgram.account.mxeAccount.fetch(mxeAddr);
  console.log("MXE Status Raw:", mxeAcc.status);
  console.log("MXE Cluster Offset:", mxeAcc.clusterOffset);
  console.log("MXE Lut Offset Slot:", mxeAcc.lutOffsetSlot.toString());
  console.log("MXE Public Key Set?:", !!mxeAcc.publicKey);
}

main().catch(console.error);
