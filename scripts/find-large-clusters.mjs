import * as anchor from "@coral-xyz/anchor";
import { getArciumProgram, getClusterAccAddress } from "@arcium-hq/client";

anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider();

async function main() {
    console.log(">>> FINDING A CLUSTER WITH >= 4 NODES <<<");
    const arciumProgram = getArciumProgram(provider);

    try {
        const clusters = await arciumProgram.account.cluster.all();
        
        let found = false;
        // Check for 4+ nodes and active
        const viableClusters = clusters.filter(c => {
            const hasEnoughNodes = c.account.nodes && c.account.nodes.length >= 4;
            const act = c.account.activation.activationEpoch;
            const actStr = act['0'] ? act['0'].toString() : act.toString();
            const deactStr = c.account.activation.deactivationEpoch['0'] ? c.account.activation.deactivationEpoch['0'].toString() : c.account.activation.deactivationEpoch.toString();
            const isActive = actStr !== "18446744073709551615" && deactStr === "18446744073709551615";
            
            return hasEnoughNodes && isActive;
        }).map(c => ({ pubkey: c.publicKey.toBase58(), nodes: c.account.nodes.length }));

        console.log(`Found ${viableClusters.length} active clusters with 4+ nodes.`);

        for (const vc of viableClusters) {
            console.log(`Matching offset for ${vc.pubkey}...`);
            // Reverse lookup to find the offset
            for (let i = 0; i < 5000; i++) {
                if (getClusterAccAddress(i).toBase58() === vc.pubkey) {
                    console.log(`  *** Found! Offset: ${i}, Nodes: ${vc.nodes} ***`);
                    found = true;
                    break;
                }
            }
            if (!found) {
                console.log(`  Offset not found in first 5000.`);
            }
        }
    } catch(e) {
        console.error("Error:", e);
    }
}

main();
