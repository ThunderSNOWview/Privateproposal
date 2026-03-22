import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getArciumProgram, getCompDefAccOffset, getCompDefAccAddress } from "@arcium-hq/client";

const APP_ID = new PublicKey("Aiqd5dMHe1GNrxCpnMZTgcxpmkPN2335ysfCsJgspUSa");

anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider() as anchor.AnchorProvider;
const arciumProgram = getArciumProgram(provider);

function getOffset(name: string): number {
    return Buffer.from(getCompDefAccOffset(name)).readUInt32LE();
}

async function checkCompDef(name: string) {
    const offset = getOffset(name);
    const addr = getCompDefAccAddress(APP_ID, offset);
    console.log(`\nChecking ${name} (${addr.toBase58()}):`);

    try {
        const data = await arciumProgram.account.computationDefinitionAccount.fetch(addr);
        console.log(`  Initialized: true`);
        console.log(`  Offset: ${data.offset}`);
        console.log(`  Source: ${JSON.stringify(data.circuitSource)}`);

        // Check if it's "OnChain" and finalized
        const onChain = (data.circuitSource as any).onChain;
        if (onChain && onChain.length > 0) {
            console.log(`  OnChain Info: isCompleted=${onChain[0].isCompleted}, dataLen=${onChain[0].dataLen}`);
        }
    } catch (e: any) {
        console.log(`  Error: ${e.message}`);
    }
}

async function main() {
    await checkCompDef("init_tally");
    await checkCompDef("add_vote");
    await checkCompDef("reveal_tally");
}

main().catch(console.error);
