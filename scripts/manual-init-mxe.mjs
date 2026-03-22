import * as anchor from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { 
    getArciumProgram, 
    getMXEAccAddress,
    getRecoveryClusterAccAddress,
    getFeePoolAccAddress,
    getLookupTableAddress,
    getClusterAccAddress,
    getMempoolAccAddress,
    getExecutingPoolAccAddress,
    getComputationAccAddress,
    getCompDefAccAddress,
    getClockAccAddress
} from "@arcium-hq/client";

// Set up the provider
anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider();

// Our program ID
const programId = new anchor.web3.PublicKey("GSydhwRKG6hxxp95gfYzJzyZ69ciiJRsKW2Lkd1v4Anx");
// Actual ProgramData from 'solana program show'
const programData = new anchor.web3.PublicKey("EzQibsnKa9QtYkkfx4N9iTrTPqA81Ppts2QLzPDMbe5o");

async function main() {
    console.log(">>> FINAL MXE INITIALIZATION (VERIFIED PROGRAM DATA) <<<");
    console.log("Program ID:", programId.toBase58());
    console.log("ProgramData:", programData.toBase58());
    console.log("Payer:", provider.publicKey.toBase58());

    const arciumProgram = getArciumProgram(provider);

    try {
        const clusterOffset = 456;
        const keygenOffset = new BN(1);
        const keyRecoveryInitOffset = new BN(2);
        const lutOffset = new BN(0);

        // Derive all necessary PDAs using SDK helpers
        const mxeAccount = getMXEAccAddress(programId);
        const recoveryClusterAcc = getRecoveryClusterAccAddress(programId);
        const clusterAcc = getClusterAccAddress(clusterOffset);
        const executingPool = getExecutingPoolAccAddress(clusterOffset);
        const mempool = getMempoolAccAddress(clusterOffset);
        
        const keygenDef = getCompDefAccAddress(programId, keygenOffset);
        const keygenComp = getComputationAccAddress(clusterOffset, keygenOffset);
        const keyRecoveryInitComp = getComputationAccAddress(clusterOffset, keyRecoveryInitOffset);

        const poolAccount = getFeePoolAccAddress();
        const clockAcc = getClockAccAddress();
        const addressLookupTable = getLookupTableAddress(programId, lutOffset);

        console.log("\nStarting Part 2...");
        const sig2 = await arciumProgram.methods
            .initMxePart2(
                clusterOffset,
                programId,
                new Array(100).fill(0),
                keygenOffset,
                keyRecoveryInitOffset,
                lutOffset
            )
            .accounts({
                signer: provider.publicKey,
                cluster: clusterAcc,
                mxe: mxeAccount,
                recoveryClusterAcc: recoveryClusterAcc,
                executingPool: executingPool,
                mempool: mempool,
                mxeKeygenComputationDefinition: keygenDef,
                mxeKeygenComputation: keygenComp,
                keyRecoveryInitComputation: keyRecoveryInitComp,
                mxeProgram: programId,
                programData: programData,
                poolAccount: poolAccount,
                addressLookupTable: addressLookupTable,
                lutProgram: new anchor.web3.PublicKey("AddressLookupTab1e1111111111111111111111111"),
                clock: clockAcc,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc({ commitment: "confirmed" }); // Remove skipPreflight to get better errors

        console.log("  ✓ Part 2 success. Sig:", sig2);
        console.log("\nMXE Initialized successfully!");
    } catch (e) {
        console.error("\nMXE Initialization failed:");
        if (e.logs) {
            console.error("Logs:", e.logs);
        } else {
            console.error(e);
        }
        process.exit(1);
    }
}

main();
