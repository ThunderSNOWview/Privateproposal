import { useState } from 'react'
import { SystemProgram } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'
import BN from 'bn.js'
import { awaitComputationFinalization } from '@arcium-hq/client'
import type { VotingProgram } from '../hooks/useProgram'
import { getProposalPda } from '../lib/pdas'
import { getMxeAcc, getCompAcc, getClusterAcc, getMempoolAcc, getExecPool, getCompDef, randomOffset } from '../lib/arcium'
import { AnchorProvider } from '@coral-xyz/anchor'
import { Button } from './Button'

interface Props {
  program: VotingProgram
  provider: AnchorProvider
  onClose: () => void
  onCreated: () => void
}

type Step = 'form' | 'creating' | 'zeroing' | 'waiting_mpc' | 'done' | 'error'

export function CreateProposalModal({ program, provider, onClose, onCreated }: Props) {
  const { publicKey } = useWallet()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [durationSecs, setDurationSecs] = useState(24 * 3600)
  const [step, setStep] = useState<Step>('form')
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!publicKey) return
    setStep('creating')
    setError('')

    try {
      const nonce = new BN(
        Buffer.from(crypto.getRandomValues(new Uint8Array(8)))
      )
      const [proposalPda] = getProposalPda(publicKey, nonce)
      const endTime = new BN(Math.floor(Date.now() / 1000) + durationSecs)

      await program.methods
        .createProposal(nonce, title.trim(), description.trim(), endTime)
        .accountsPartial({
          creator: publicKey,
          proposal: proposalPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed', skipPreflight: true })

      setStep('zeroing')
      const computationOffset = randomOffset()

      await program.methods
        .zeroTally(computationOffset)
        .accountsPartial({
          payer: publicKey,
          mxeAccount: getMxeAcc(),
          computationAccount: getCompAcc(computationOffset),
          clusterAccount: getClusterAcc(),
          mempoolAccount: getMempoolAcc(),
          executingPool: getExecPool(),
          compDefAccount: getCompDef('init_tally'),
          proposal: proposalPda,
        })
        .rpc({ commitment: 'confirmed', skipPreflight: true })

      setStep('done')
      setTimeout(() => {
        onCreated()
        onClose()
      }, 1200)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('error')
    }
  }

  const titleLen = title.trim().length
  const descLen = description.trim().length
  const canSubmit = titleLen > 0 && titleLen <= 64 && descLen <= 256 && step === 'form'

  const STEP_LABELS: Record<Step, string> = {
    form: '',
    creating: 'Securing proposal on-chain…',
    zeroing: 'Initializing MPC Tally…',
    waiting_mpc: 'Computing encrypted zero…',
    done: 'Proposal is now ACTIVE',
    error: '',
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0e14]/90 backdrop-blur-xl animate-fade-in">
      <div className="w-full max-w-xl mx-4 bg-[#161a21] border border-white/10 rounded-[32px] shadow-[0_32px_64px_rgba(0,0,0,0.5)] overflow-hidden relative">
         <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#7e51ff] to-[#b6a0ff]" />
         
        {/* Header */}
        <div className="px-8 pt-10 pb-6 flex items-center justify-between">
          <div>
            <h2 className="font-display text-3xl font-black text-white">New Proposal</h2>
            <p className="text-sm font-medium text-[#a9abb3] mt-1">Submit your initiative to the Arcium collective.</p>
          </div>
          {(step === 'form' || step === 'error') && (
            <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/5 transition-colors flex items-center justify-center text-2xl text-[#a9abb3]">✕</button>
          )}
        </div>

        {/* Body */}
        <div className="px-8 py-4 space-y-6">
          {(step === 'form' || step === 'error') && (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[#a9abb3] uppercase tracking-widest px-1">Proposal Title</label>
                <input
                  className="w-full bg-[#0b0e14] border border-white/5 rounded-2xl px-5 py-4 text-white placeholder-white/20 text-lg font-bold focus:outline-none focus:border-[#b6a0ff]/40 focus:ring-4 focus:ring-[#b6a0ff]/5 transition-all"
                  placeholder="Enter a concise title"
                  maxLength={64}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[#a9abb3] uppercase tracking-widest px-1">Context & Description</label>
                <textarea
                  className="w-full bg-[#0b0e14] border border-white/5 rounded-2xl px-5 py-4 text-[#ecedf6] placeholder-white/20 text-sm font-medium focus:outline-none focus:border-[#b6a0ff]/40 focus:ring-4 focus:ring-[#b6a0ff]/5 transition-all resize-none"
                  placeholder="Detail the proposed changes..."
                  rows={4}
                  maxLength={256}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-[#a9abb3] uppercase tracking-widest px-1">Voting Duration</label>
                <div className="grid grid-cols-4 gap-3">
                  {([1, 24, 72, 168] as const).map(h => {
                    const secs = h * 3600
                    const label = h < 24 ? `${h}h` : `${h / 24}d`
                    return (
                      <button
                        key={h}
                        onClick={() => setDurationSecs(secs)}
                        className={`py-3 rounded-xl text-xs font-black border transition-all ${
                          durationSecs === secs
                            ? 'bg-[#b6a0ff]/10 border-[#b6a0ff]/40 text-[#b6a0ff]'
                            : 'bg-white/2 border-white/5 text-[#a9abb3] hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {step === 'error' && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold text-center">
                  Error: {error}
                </div>
              )}
            </>
          )}

          {step !== 'form' && step !== 'error' && (
            <div className="py-16 flex flex-col items-center gap-6 animate-slide-up">
              {step === 'done' ? (
                <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                  ✓
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full border-4 border-[#b6a0ff]/20 border-t-[#b6a0ff] animate-spin" />
              )}
              <div className="text-center">
                <p className="font-display text-xl font-bold text-white">{STEP_LABELS[step]}</p>
                <p className="text-xs font-medium text-[#a9abb3] mt-2 opacity-60 uppercase tracking-widest">MPC Encryption Layer Active</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'form' || step === 'error') && (
          <div className="px-8 pb-10 pt-4 flex items-center justify-end gap-4">
            <Button variant="ghost" onClick={onClose} className="uppercase tracking-widest text-[10px]">Back</Button>
            <Button onClick={handleCreate} disabled={!canSubmit} className="text-lg px-8">Create Initiative</Button>
          </div>
        )}
      </div>
    </div>
  )
}
