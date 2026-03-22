import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider } from '@coral-xyz/anchor'
import BN from 'bn.js'
import { awaitComputationFinalization } from '@arcium-hq/client'
import type { VotingProgram } from '../hooks/useProgram'
import type { ProposalAccount } from '../hooks/useProposals'
import { Badge } from './Badge'
import { Card } from './Card'
import { Button } from './Button'
import { VoteModal } from './VoteModal'
import { getMxeAcc, getCompAcc, getClusterAcc, getMempoolAcc, getExecPool, getCompDef, randomOffset } from '../lib/arcium'

interface Props {
  proposal: ProposalAccount
  program: VotingProgram
  provider: AnchorProvider
  currentPower: number | null // Renamed to Power in UI
  hasVoted: boolean
  onRefresh: () => void
}

function formatTimeLeft(endTimeSecs: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = endTimeSecs - now
  if (diff <= 0) return 'Ended'
  if (diff < 3600) return `${Math.floor(diff / 60)}m left`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`
  return `${Math.floor(diff / 86400)}d left`
}

export function ProposalCard({ proposal, program, provider, currentPower, hasVoted, onRefresh }: Props) {
  const { publicKey } = useWallet()
  const [showVoteModal, setShowVoteModal] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState('')
  const [, setTick] = useState(0)

  const { account } = proposal
  const statusKey = Object.keys(account.status)[0] as 'active' | 'closed' | 'initializing' | 'finalized'
  const endTimeSecs = account.endTime.toNumber()
  const now = Math.floor(Date.now() / 1000)
  const isExpired = now >= endTimeSecs

  useEffect(() => {
    if (statusKey !== 'active' || isExpired) return
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [statusKey, isExpired])

  const canVote = statusKey === 'active' && !isExpired && !hasVoted && currentPower !== null && currentPower >= 1
  const canClose = statusKey === 'active' && isExpired

  async function handleClose() {
    if (!publicKey) return
    setClosing(true)
    setCloseError('')
    try {
      const computationOffset = randomOffset()
      await program.methods
        .closeProposal(computationOffset)
        .accountsPartial({
          payer: publicKey,
          mxeAccount: getMxeAcc(),
          computationAccount: getCompAcc(computationOffset),
          clusterAccount: getClusterAcc(),
          mempoolAccount: getMempoolAcc(),
          executingPool: getExecPool(),
          compDefAccount: getCompDef('reveal_tally'),
          proposal: proposal.publicKey,
        })
        .rpc({ commitment: 'confirmed', skipPreflight: true })

      await awaitComputationFinalization(provider, computationOffset, program.programId, 'confirmed')
      onRefresh()
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : 'Close failed')
    } finally {
      setClosing(false)
    }
  }

  const result = account.result as BN | null
  const netTally = result !== null ? result.toNumber() : null
  const passed = netTally !== null && netTally > 0

  return (
    <>
      <Card className="flex flex-col h-full group" glow={statusKey === 'active' ? 'blue' : 'none'}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <Badge status={statusKey} />
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#a9abb3] uppercase tracking-wider">
            <span>⏱️</span>
            <span>{formatTimeLeft(endTimeSecs)}</span>
          </div>
        </div>

        <h3 className="font-display text-xl font-bold text-white mb-2 leading-tight group-hover:text-[#b6a0ff] transition-colors line-clamp-2">
          {account.title}
        </h3>
        
        {account.description && (
          <p className="text-sm text-[#a9abb3] mb-6 line-clamp-3 leading-relaxed font-medium">
            {account.description}
          </p>
        )}

        <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] text-[#a9abb3] font-bold uppercase tracking-widest">Participation</span>
            <span className="text-sm font-black text-white">{account.voteCount} Voters</span>
          </div>

          <div className="flex items-center gap-2">
            {statusKey === 'finalized' && netTally !== null && (
              <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 font-bold text-xs ${
                passed ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                {passed ? 'PASSED' : 'FAILED'}
                <span className="opacity-60 text-[10px]">{netTally > 0 ? '+' : ''}{netTally}</span>
              </div>
            )}

            {canVote && (
              <Button onClick={() => setShowVoteModal(true)} variant="primary" className="px-4 py-2 text-xs">
                Vote
              </Button>
            )}

            {hasVoted && statusKey === 'active' && (
              <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-[#a9abb3]">
                ✓ VOTED
              </div>
            )}

            {canClose && (
              <Button onClick={handleClose} loading={closing} variant="secondary" className="px-4 py-2 text-xs">
                Reveal
              </Button>
            )}
          </div>
        </div>

        {closeError && (
          <p className="mt-3 text-[10px] font-bold text-red-400 uppercase text-center">{closeError}</p>
        )}
      </Card>

      {showVoteModal && currentPower !== null && (
        <VoteModal
          program={program}
          provider={provider}
          proposal={proposal}
          currentPower={currentPower}
          onClose={() => setShowVoteModal(false)}
          onVoted={onRefresh}
        />
      )}
    </>
  )
}
