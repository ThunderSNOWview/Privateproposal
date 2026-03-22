import * as anchor from "@coral-xyz/anchor";
import { getArciumProgram } from "@arcium-hq/client";

// Set up the provider
anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider();

async function main() {
    console.log(">>> FETCHING ALL ARCIUM CLUSTERS <<<");
    const arciumProgram = getArciumProgram(provider);

    try {
        const clusters = await arciumProgram.account.cluster.all();
        console.log(`Found ${clusters.length} clusters deployed by the Arcium Program.`);
        
        clusters.forEach((c, index) => {
            console.log(`\nCluster [${index}] Pubkey: ${c.publicKey.toBase58()}`);
            console.log(`  Authority: ${c.account.authority ? c.account.authority.toBase58() : "None"}`);
            // Check the activation object depending on how it's represented
            console.log(`  Activation:`, c.account.activation);
            console.log(`  Nodes: ${c.account.nodes ? c.account.nodes.length : 0}`);
            console.log(`  Cluster Size: ${c.account.clusterSize}`);
            
            // Try to deduce offset if it's derivable (not easily derivable backwards without seeds, but we can look for "active" ones)
            if (c.account.activation?.active || c.account.activation?.active === null) {
                console.log(`  *** POTENTIALLY ACTIVE OR READY ***`);
            }
        });
    } catch(e) {
        console.error("Failed to fetch clusters:", e);
    }
}

main();
