import { useState } from 'react'
import { SystemProgram } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'
import BN from 'bn.js'
import { awaitComputationFinalization } from '@arcium-hq/client'
import { AnchorProvider } from '@coral-xyz/anchor'
import type { VotingProgram } from '../hooks/useProgram'
import type { ProposalAccount } from '../hooks/useProposals'
import { getVoterCreditsPda, getVoterRecordPda } from '../lib/pdas'
import { getMxeAcc, getCompAcc, getClusterAcc, getMempoolAcc, getExecPool, getCompDef, randomOffset } from '../lib/arcium'
import { encryptVote } from '../lib/encrypt'
import { Button } from './Button'

interface Props {
  program: VotingProgram
  provider: AnchorProvider
  proposal: ProposalAccount
  currentPower: number
  onClose: () => void
  onVoted: () => void
}

type Step = 'form' | 'encrypting' | 'submitting' | 'waiting_mpc' | 'done' | 'error'

export function VoteModal({ program, provider, proposal, currentPower, onClose, onVoted }: Props) {
  const { publicKey } = useWallet()
  const [direction, setDirection] = useState<0 | 1>(1)
  const [numVotes, setNumVotes] = useState(1)
  const [step, setStep] = useState<Step>('form')
  const [error, setError] = useState('')

  const cost = numVotes * numVotes
  const creditsAfter = currentPower - cost
  const canVote = step === 'form' && creditsAfter >= 0 && numVotes >= 1 && numVotes <= 10

  async function handleVote() {
    if (!publicKey) return
    setStep('encrypting')
    setError('')

    try {
      const { directionCiphertext, pubKey, nonceBN } = await encryptVote(direction, provider)

      setStep('submitting')
      const computationOffset = randomOffset()
      const [vcPda] = getVoterCreditsPda(publicKey)
      const [vrPda] = getVoterRecordPda(publicKey, proposal.publicKey)

      await program.methods
        .castVote(
          computationOffset,
          directionCiphertext,
          pubKey,
          nonceBN,
          new BN(numVotes)
        )
        .accountsPartial({
          payer: publicKey,
          mxeAccount: getMxeAcc(),
          computationAccount: getCompAcc(computationOffset),
          clusterAccount: getClusterAcc(),
          mempoolAccount: getMempoolAcc(),
          executingPool: getExecPool(),
          compDefAccount: getCompDef('add_vote'),
          proposal: proposal.publicKey,
          voterCredits: vcPda,
          voterRecord: vrPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed', skipPreflight: true })

      setStep('waiting_mpc')
      await awaitComputationFinalization(
        provider,
        computationOffset,
        program.programId,
        'confirmed'
      )

      setStep('done')
      setTimeout(() => {
        onVoted()
        onClose()
      }, 1200)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('already in use') ? 'You already voted on this proposal.' : msg)
      setStep('error')
    }
  }

  const STEP_LABELS: Record<Step, string> = {
    form: '',
    encrypting: 'Generating x25519 Ciphertext',
    submitting: 'Committing to Blockchain',
    waiting_mpc: 'Decentralized MPC Tallying',
    done: 'VOTE FINALIZED',
    error: '',
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0e14]/90 backdrop-blur-xl animate-fade-in">
      <div className="w-full max-w-lg mx-4 bg-[#161a21] border border-white/10 rounded-[32px] shadow-[0_32px_64px_rgba(0,0,0,0.5)] overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#00affe] to-[#b6a0ff]" />

        {/* Header */}
        <div className="px-8 pt-10 pb-6">
           <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h2 className="font-display text-2xl font-black text-white line-clamp-2 leading-tight pr-8">{proposal.account.title}</h2>
              <p className="text-xs font-bold text-[#a9abb3] uppercase tracking-[0.2em] opacity-60">Private Quadratic Vote</p>
            </div>
            {(step === 'form' || step === 'error') && (
              <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/5 transition-colors flex items-center justify-center text-2xl text-[#a9abb3] shrink-0">✕</button>
            )}
           </div>
        </div>

        {/* Body */}
        <div className="px-8 py-4 space-y-8">
          {(step === 'form' || step === 'error') && (
            <>
              {/* Direction */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-[#a9abb3] uppercase tracking-widest px-1">Vote Direction</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setDirection(1)}
                    className={`py-6 rounded-2xl flex flex-col items-center gap-2 border-2 transition-all ${
                      direction === 1
                        ? 'bg-green-500/10 border-green-500/40 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.15)]'
                        : 'bg-white/2 border-white/5 text-[#a9abb3] hover:border-white/20'
                    }`}
                  >
                    <span className="text-2xl">👍</span>
                    <span className="font-black text-xs uppercase tracking-widest">Support</span>
                  </button>
                  <button
                    onClick={() => setDirection(0)}
                    className={`py-6 rounded-2xl flex flex-col items-center gap-2 border-2 transition-all ${
                      direction === 0
                        ? 'bg-red-500/10 border-red-500/40 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
                        : 'bg-white/2 border-white/5 text-[#a9abb3] hover:border-white/20'
                    }`}
                  >
                    <span className="text-2xl">👎</span>
                    <span className="font-black text-xs uppercase tracking-widest">Oppose</span>
                  </button>
                </div>
              </div>

              {/* Slider */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-bold text-[#a9abb3] uppercase tracking-widest">Vote Intensity</label>
                  <span className="font-display font-black text-2xl text-white">{numVotes}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={Math.min(10, Math.floor(Math.sqrt(currentPower)))}
                  value={numVotes}
                  onChange={e => setNumVotes(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#b6a0ff]"
                />
              </div>

              {/* Math card */}
              <div className="p-6 rounded-2xl bg-[#0b0e14] border border-white/5 space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#a9abb3] font-bold uppercase tracking-widest">Quadratic Cost</span>
                  <span className="text-white font-black">{numVotes}² = <span className="text-[#b6a0ff]">{cost} Power</span></span>
                </div>
                <div className="h-px bg-white/5" />
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#a9abb3] font-bold uppercase tracking-widest">Wallet Balance</span>
                  <span className="text-[#a9abb3] font-bold">{currentPower} Power</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-sm font-black text-white">Remaining</span>
                  <span className={`font-display font-black text-lg ${creditsAfter >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {creditsAfter}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-xl bg-[#00affe]/5 border border-[#00affe]/10">
                <span className="text-lg">🔐</span>
                <p className="text-[10px] font-medium leading-relaxed text-[#00affe]/80 uppercase tracking-wider">
                  Direction is encrypted with ephemeral keys. Only the Arcium Cluster can decrypt and tally.
                </p>
              </div>

              {step === 'error' && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold text-center">
                  Error: {error}
                </div>
              )}
            </>
          )}

          {step !== 'form' && step !== 'error' && (
            <div className="py-20 flex flex-col items-center gap-8 animate-slide-up">
              {step === 'done' ? (
                <div className="w-24 h-24 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-5xl shadow-[0_0_40px_rgba(34,197,94,0.2)]">
                  ✓
                </div>
              ) : (
                <div className="relative">
                  <div className="w-24 h-24 rounded-full border-4 border-[#00affe]/20 border-t-[#00affe] animate-spin" />
                  <span className="absolute inset-0 flex items-center justify-center text-3xl">🔒</span>
                </div>
              )}
              <div className="text-center space-y-2">
                <p className="font-display text-2xl font-black text-white uppercase tracking-tight">{STEP_LABELS[step]}</p>
                <p className="text-xs font-bold text-[#a9abb3] opacity-60 tracking-[0.3em] uppercase">Arcium Vault Protocol V1</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'form' || step === 'error') && (
          <div className="px-8 pb-12 pt-4 flex items-center justify-end gap-4">
            <Button variant="ghost" onClick={onClose} className="uppercase tracking-widest text-[10px]">Abandon</Button>
            <Button onClick={handleVote} disabled={!canVote} className="text-lg px-8">Confirm Vote</Button>
          </div>
        )}
      </div>
    </div>
  )
}
