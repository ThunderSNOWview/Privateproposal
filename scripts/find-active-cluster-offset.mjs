import * as anchor from "@coral-xyz/anchor";
import { getArciumProgram, getClusterAccAddress } from "@arcium-hq/client";

// Set up the provider
anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider();

async function main() {
    console.log(">>> FINDING ACTIVE CLUSTER OFFSET <<<");
    const arciumProgram = getArciumProgram(provider);

    try {
        const clusters = await arciumProgram.account.cluster.all();
        
        // Find clusters where activationEpoch is not u64::MAX
        const activePubkeys = clusters.filter(c => {
            const act = c.account.activation.activationEpoch;
            // Handle BN
            const actStr = act['0'] ? act['0'].toString() : act.toString();
            const deactStr = c.account.activation.deactivationEpoch['0'] ? c.account.activation.deactivationEpoch['0'].toString() : c.account.activation.deactivationEpoch.toString();
            // A cluster is probably active if activationEpoch < MAX and deactivationEpoch == MAX
            return actStr !== "18446744073709551615" && deactStr === "18446744073709551615";
        }).map(c => c.publicKey.toBase58());

        console.log(`Found ${activePubkeys.length} active clusters.`);

        for (let i = 0; i < 5000; i++) {
            const pda = getClusterAccAddress(i).toBase58();
            if (activePubkeys.includes(pda)) {
                console.log(`\n  *** ACTIVE CLUSTER FOUND ***`);
                console.log(`  Offset: ${i}`);
                console.log(`  Pubkey: ${pda}`);
                return;
            }
        }
        console.log("No offset found in the first 5000 derivations.");

    } catch(e) {
        console.error("Failed to fetch clusters:", e);
    }
}

main();
