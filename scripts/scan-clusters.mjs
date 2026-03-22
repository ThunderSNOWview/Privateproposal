import * as anchor from "@coral-xyz/anchor";
import { 
    getArciumProgram, 
    getClusterAccAddress 
} from "@arcium-hq/client";

// Set up the provider
anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider();

async function main() {
    console.log(">>> ARCIUM CLUSTER SCANNER <<<");
    const arciumProgram = getArciumProgram(provider);

    for (let i = 0; i < 100; i++) {
        const clusterAddr = getClusterAccAddress(i);
        console.log(`Checking Cluster ${i} (${clusterAddr.toBase58()})...`);
        try {
            const clusterData = await arciumProgram.account.cluster.fetch(clusterAddr);
            console.log(`  ✓ Cluster ${i} exists!`);
            console.log(`    Nodes: ${clusterData.nodes.length}`);
            console.log(`    Activation: ${JSON.stringify(clusterData.activation)}`);
            if (clusterData.activation.active) {
                console.log(`    *** FOUND ACTIVE CLUSTER: ${i} ***`);
            }
        } catch (e) {
            console.log(`  - Cluster ${i} does not exist or empty.`);
        }
    }
}

main();
