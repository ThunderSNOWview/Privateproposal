import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { SystemProgram } from '@solana/web3.js'
import { WalletButton } from './components/WalletButton'
import { ProposalCard } from './components/ProposalCard'
import { CreateProposalModal } from './components/CreateProposalModal'
import { Button } from './components/Button'
import { Card } from './components/Card'
import { Badge } from './components/Badge'
import { useProgram } from './hooks/useProgram'
import { useProposals } from './hooks/useProposals'
import { useVoterPower } from './hooks/useVoterPower'
import { useVotedProposals } from './hooks/useVotedProposals'
import { getVoterCreditsPda } from './lib/pdas'

export function App() {
  const { publicKey } = useWallet()
  const ctx = useProgram()
  const { proposals, loading: loadingProposals, refetch } = useProposals(ctx?.program ?? null)
  const { power, registered, loading: loadingCredits, refetch: refetchCredits } = useVoterPower(
    ctx?.program ?? null,
    publicKey ?? null
  )
  const [showCreate, setShowCreate] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState<'active' | 'mine' | 'voted' | 'ended'>('active')

  const { votedKeys: votedProposalKeys, refetch: refetchVoted } = useVotedProposals(
    ctx?.provider.connection ?? null,
    publicKey,
    proposals
  )

  async function handleRegister() {
    if (!ctx || !publicKey) return
    setRegisterLoading(true)
    try {
      const [vcPda] = getVoterCreditsPda(publicKey)
      await ctx.program.methods
        .registerVoter()
        .accountsPartial({
          voter: publicKey,
          voterCredits: vcPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed', skipPreflight: true })
      await refetchCredits()
    } catch (e) {
      console.error('Register failed:', e)
    } finally {
      setRegisterLoading(false)
    }
  }

  const filtered = proposals.filter(p => {
    const s = Object.keys(p.account.status)[0]
    if (activeFilter === 'active') return s === 'active' || s === 'initializing'
    if (activeFilter === 'mine')   return publicKey != null && p.account.creator.equals(publicKey)
    if (activeFilter === 'voted')  return votedProposalKeys.has(p.publicKey.toBase58())
    if (activeFilter === 'ended')  return s === 'closed' || s === 'finalized'
    return true
  })

  return (
    <div className="min-h-screen bg-[#0b0e14] text-[#ecedf6] selection:bg-[#b6a0ff]/30">
      {/* Radiant Glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#b6a0ff]/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#00affe]/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Navigation */}
      <nav className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#0b0e14]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7e51ff] to-[#b6a0ff] flex items-center justify-center font-bold text-lg shadow-glow-violet text-[#340090]">
            A
          </div>
          <div>
            <h1 className="font-display font-extrabold text-lg leading-tight tracking-tight">Arcium Governance</h1>
            <p className="text-[10px] text-[#a9abb3] uppercase tracking-[0.2em] font-semibold">Decentralized Privacy</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <WalletButton />
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {!publicKey ? (
          /* High-end Landing */
          <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
             <div className="w-24 h-24 rounded-3xl bg-glass flex items-center justify-center text-5xl shadow-glow-violet mb-8">
              🔒
            </div>
            <h2 className="font-display text-4xl md:text-6xl font-extrabold mb-6 bg-gradient-to-r from-white to-[#b6a0ff] bg-clip-text text-transparent tracking-tighter">
              Confidentially Cast. Collectively Powerful.
            </h2>
            <p className="text-[#a9abb3] max-w-2xl text-lg mb-12 leading-relaxed font-medium">
              Securely participate in the future of governance with blind MPC execution. Shield your conviction, eliminate herd bias, and harness the true Power of private voting.
            </p>
            <WalletButton />
          </div>
        ) : (
          <div className="space-y-12">
            {/* Hero Section: Power Card */}
            <section>
               <Card glow="violet" className="flex flex-col md:flex-row items-center justify-between gap-8 py-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#b6a0ff]/10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="space-y-2">
                  <p className="text-[#a9abb3] text-sm uppercase tracking-widest font-bold">Your Voting Power</p>
                  <div className="flex items-baseline gap-3">
                    <h3 className="font-display text-6xl font-black text-white">{power ?? 0}</h3>
                    <span className="text-xl font-bold text-[#b6a0ff]">Power</span>
                  </div>
                </div>
                
                <div className="w-full md:w-auto flex flex-col gap-3 min-w-[240px]">
                  {!registered ? (
                    <Button onClick={handleRegister} loading={registerLoading} className="w-full text-lg py-4">
                      Register as Voter
                    </Button>
                  ) : (
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
                       <p className="text-xs text-[#a9abb3] font-medium">Voter status</p>
                       <div className="flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                         <span className="text-sm font-bold text-green-400">ACTIVE ON DEVNET</span>
                       </div>
                    </div>
                  )}
                  <p className="text-[10px] text-center text-[#a9abb3] font-medium opacity-60 uppercase tracking-tighter">
                    Secured by Arcium MPC Cluster 456
                  </p>
                </div>
              </Card>
            </section>

            {/* Content Section */}
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6 overflow-x-auto pb-2 border-b border-white/5">
                  {([
                    { key: 'active', label: 'Proposals' },
                    { key: 'mine',   label: 'My Drafts' },
                    { key: 'voted',  label: 'Voted' },
                    { key: 'ended',  label: 'Archives' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setActiveFilter(key)}
                      className={`relative pb-3 text-sm font-bold transition-all ${
                        activeFilter === key ? 'text-white' : 'text-[#a9abb3] hover:text-white'
                      }`}
                    >
                      {label}
                      {activeFilter === key && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-[#7e51ff] to-[#b6a0ff]" />
                      )}
                    </button>
                  ))}
                </div>
                {registered && (
                  <Button variant="secondary" onClick={() => setShowCreate(true)} className="hidden md:flex gap-2">
                    <span>+</span>
                    <span>New Proposal</span>
                  </Button>
                )}
              </div>

              {loadingProposals ? (
                <div className="flex items-center justify-center py-24 gap-3 text-[#a9abb3]">
                  <div className="w-6 h-6 border-2 border-[#b6a0ff]/20 border-t-[#b6a0ff] rounded-full animate-spin" />
                  <span className="font-bold tracking-wide">Retrieving Governance State...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-[#a9abb3] bg-white/2 rounded-3xl border border-dashed border-white/5">
                  <span className="text-5xl opacity-40">🗳️</span>
                  <p className="font-bold text-lg">No active governances found</p>
                  {registered && (
                    <Button variant="ghost" onClick={() => setShowCreate(true)}>Create the first proposal</Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-up">
                  {filtered.map(p => (
                    <ProposalCard
                      key={p.publicKey.toBase58()}
                      proposal={p}
                      program={ctx!.program}
                      provider={ctx!.provider}
                      currentPower={power}
                      hasVoted={votedProposalKeys.has(p.publicKey.toBase58())}
                      onRefresh={() => { refetch(); refetchCredits(); refetchVoted() }}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* FAB for mobile proposal creation */}
      {registered && (
        <button
          onClick={() => setShowCreate(true)}
          className="md:hidden fixed bottom-8 right-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-[#7e51ff] to-[#b6a0ff] text-[#340090] shadow-glow-violet flex items-center justify-center text-3xl font-black z-40 active:scale-95 transition-all"
        >
          +
        </button>
      )}

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-white/5 text-center">
        <p className="text-[10px] text-[#a9abb3] font-bold uppercase tracking-[0.3em] opacity-40">
          Ref Fresh Program 8bXD7R • Devnet 2026
        </p>
      </footer>

      {/* Modals */}
      {showCreate && ctx && (
        <CreateProposalModal
          program={ctx.program}
          provider={ctx.provider}
          onClose={() => setShowCreate(false)}
          onCreated={() => { refetch(); refetchCredits() }}
        />
      )}
    </div>
  )
}
