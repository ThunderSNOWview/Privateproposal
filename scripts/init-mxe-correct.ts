import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getArciumProgram, getMXEAccAddress, getClusterAccAddress } from "@arcium-hq/client";

// The Arcium program ID on devnet (Dispatcher/Manager)
const ARCIUM_PROG_ID = new PublicKey("CqUikXpnsHgymR3yN61YYzwj8vH82b7zyJSKaDwvVWED");
// The Arcium base program that owns the accounts
const ARCIUM_BASE_ID = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
// The application ID (your private voting program)
const APP_ID = new PublicKey("Aiqd5dMHe1GNrxCpnMZTgcxpmkPN2335ysfCsJgspUSa");
// The cluster offset (devnet cluster 456)
const CLUSTER_OFFSET = 456;
const RECOVERY_PEERS = [2443328246, 3217924102, 100003, 3557419748];

anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider() as anchor.AnchorProvider;

async function main() {
    console.log("Starting manual MXE initialization...");

    // 1. Get the Arcium program instance pointing to the correct ID
    const arciumProgram = getArciumProgram(provider);
    // Re-define it if the library uses a hardcoded default
    const program = new anchor.Program(arciumProgram.idl as anchor.Idl, provider);

    const mxePda = getMXEAccAddress(APP_ID);
    console.log(`MXE PDA to initialize: ${mxePda.toBase58()}`);

    const clusterAcc = getClusterAccAddress(CLUSTER_OFFSET);
    const clusterData = await (program.account as any).cluster.fetch(clusterAcc);
    console.log(`Using Cluster ${CLUSTER_OFFSET} with ${clusterData.nodes.length} nodes`);

    const nodeOffsets = clusterData.nodes.map((n: any) => n.offset);
    console.log(`Node offsets: ${nodeOffsets}`);

    // Part 1: Init MXE
    console.log("Calling initMxePart1...");
    try {
        const tx1 = await program.methods
            .initMxePart1()
            .accountsPartial({
                signer: provider.publicKey,
                mxeProgram: APP_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc({ commitment: "confirmed" });
        console.log(`Part 1 success: ${tx1}`);

        // Funding MXE account
        console.log("Funding MXE account with 0.2 SOL...");
        const fundTx = new anchor.web3.Transaction().add(
            anchor.web3.SystemProgram.transfer({
                fromPubkey: provider.publicKey,
                toPubkey: mxePda,
                lamports: 0.2 * anchor.web3.LAMPORTS_PER_SOL,
            })
        );
        await provider.sendAndConfirm(fundTx);
        console.log("Funding success!");
    } catch (e: any) {
        if (e.message.includes("already in use")) {
            console.log("Part 1 already initialized, skipping...");
        } else {
            throw e;
        }
    }

    // Part 2: Connect to cluster
    const recoveryPeers = [...RECOVERY_PEERS, ...new Array(100 - RECOVERY_PEERS.length).fill(0)];
    const keygenOffset = new anchor.BN(require("crypto").randomBytes(8), "le");
    const keyRecoveryInitOffset = new anchor.BN(require("crypto").randomBytes(8), "le");
    const recentSlot = await provider.connection.getSlot();
    const recentOffset = new anchor.BN(recentSlot);

    console.log(`Using Keygen: ${keygenOffset.toString(16)}, Recovery: ${keyRecoveryInitOffset.toString(16)}, Recent Slot: ${recentSlot}`);

    const [recoveryClusterAcc] = PublicKey.findProgramAddressSync(
        [Buffer.from("RecoveryClusterAccount"), APP_ID.toBuffer()],
        ARCIUM_BASE_ID
    );
    const [executingPool] = PublicKey.findProgramAddressSync(
        [Buffer.from("Execpool"), Buffer.from(new Uint32Array([CLUSTER_OFFSET]).buffer)],
        ARCIUM_BASE_ID
    );
    const [mempool] = PublicKey.findProgramAddressSync(
        [Buffer.from("Mempool"), Buffer.from(new Uint32Array([CLUSTER_OFFSET]).buffer)],
        ARCIUM_BASE_ID
    );
    const [mxeKeygenComputationDefinition] = PublicKey.findProgramAddressSync(
        [Buffer.from("ComputationDefinitionAccount"), APP_ID.toBuffer(), Buffer.from([1, 0, 0, 0])],
        ARCIUM_BASE_ID
    );
    const [mxeKeygenComputation] = PublicKey.findProgramAddressSync(
        [Buffer.from("ComputationAccount"), Buffer.from(new Uint32Array([CLUSTER_OFFSET]).buffer), keygenOffset.toArrayLike(Buffer, "le", 8)],
        ARCIUM_BASE_ID
    );
    const [keyRecoveryInitComputation] = PublicKey.findProgramAddressSync(
        [Buffer.from("ComputationAccount"), Buffer.from(new Uint32Array([CLUSTER_OFFSET]).buffer), keyRecoveryInitOffset.toArrayLike(Buffer, "le", 8)],
        ARCIUM_BASE_ID
    );
    const [programData] = PublicKey.findProgramAddressSync(
        [APP_ID.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
    );
    const [addressLookupTable] = PublicKey.findProgramAddressSync(
        [mxePda.toBuffer(), recentOffset.toArrayLike(Buffer, "le", 8)],
        anchor.web3.AddressLookupTableProgram.programId
    );

    console.log("Calling initMxePart2...");
    const tx2 = await program.methods
        .initMxePart2(
            CLUSTER_OFFSET,
            APP_ID,
            recoveryPeers,
            keygenOffset,
            keyRecoveryInitOffset,
            recentOffset
        )
        .accounts({
            signer: provider.publicKey,
            cluster: clusterAcc,
            mxe: mxePda,
            recoveryClusterAcc,
            executingPool,
            mempool,
            mxeKeygenComputationDefinition,
            mxeKeygenComputation,
            keyRecoveryInitComputation,
            mxeProgram: APP_ID,
            programData,
            addressLookupTable,
            systemProgram: anchor.web3.SystemProgram.programId,
            addressLookupTableProgram: anchor.web3.AddressLookupTableProgram.programId,
        })
        .rpc({ commitment: "confirmed" });
    console.log(`Part 2 success: ${tx2}`);

    console.log("MXE Initialization Complete!");
}

main().catch(console.error);
