import { PublicKey } from '@solana/web3.js'
import { getCompDefAccOffset } from '@arcium-hq/client'

export const PROGRAM_ID = new PublicKey('8bXD7RRyNSxjWJdjzTZNmdpowq4NhafLfHNUXMGge1Ri')
export const ARCIUM_CLUSTER_OFFSET = 456 // devnet (number, as required by arcium client API)
export const RPC_URL = 'https://api.devnet.solana.com'
export const COMMITMENT = 'confirmed' as const

export function compDefOffsetNum(name: string): number {
  return Buffer.from(getCompDefAccOffset(name)).readUInt32LE(0)
}
