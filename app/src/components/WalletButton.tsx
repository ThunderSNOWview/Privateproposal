import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { Button } from './Button'

export function WalletButton() {
  const { publicKey, disconnect, connecting } = useWallet()
  const { setVisible } = useWalletModal()

  if (connecting) {
    return (
      <Button variant="secondary" loading disabled>
        Connecting…
      </Button>
    )
  }

  if (publicKey) {
    const addr = publicKey.toBase58()
    const short = `${addr.slice(0, 4)}…${addr.slice(-4)}`
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-[#ecedf6] bg-white/5 border border-white/10 px-4 py-2.5 rounded-lg">
          {short}
        </span>
        <button
          onClick={() => disconnect()}
          className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <Button
      onClick={() => setVisible(true)}
      variant="primary"
    >
      Connect Wallet
    </Button>
  )
}
