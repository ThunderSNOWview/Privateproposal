# Arcium Governance

**Confidential governance with blind MPC execution on Solana.**

![Arcium Nocturne Dashboard](docs/images/arcium_governance_main_page_1774089214731.png)

Cast encrypted votes that protect your conviction and eliminate herd bias. Powered by Arcium's decentralized MPC network. 
# Confidentially Cast. Collectively Powerful.


---

## How It Works

### The Problem with Transparent Voting

In standard on-chain governance, every vote is visible the moment it lands. This enables:

- **Herd effects** — late voters follow early signals instead of their own conviction.
- **Bribery & coercion** — adversaries can verify compliance in real time.
- **Strategic abstention** — informed voters wait to see which way the wind blows.

### Arcium's Solution

Arcium's MPC (Multi-Party Computation) cluster holds secret shares of the encrypted vote tally. No single node — and no outside observer — can read the intermediate tally during the voting period. Only after the proposal closes does the cluster collectively reveal the plaintext result.

### Quadratic Voting Twist

Each registered voter receives **100 voting Power**. Allocating `N` votes to a proposal costs `N²` units of Power. This quadratic cost curve:

- Limits extreme concentration of influence (10 votes costs all 100 Power).
- Lets voters signal *intensity* of preference, not just direction.
- Discourages token-whale dominance without requiring token-weighting.

The quadratic deduction is enforced **on-chain** before the MPC computation runs, so budget integrity is provable without revealing anything inside the circuit.

### **Arcium Nocturne** Design System

The platform features a custom-built **Arcium Nocturne** UI, designed for a premium, low-friction governance experience:
- **Glassmorphism**: A deep space aesthetic with blurred overlays and glowing violet/blue accents.
- **Simplified Workflow**: streamlined "Hero" credit management and one-click proposal creation.
- **Real-time MPC Monitoring**: Visual feedback during encrypted tallying and computation finalization.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      Solana Program                            │
│  create_proposal → zero_tally ──────────────────────────────┐ │
│  cast_vote ──────────────────── add_vote circuit ───────────┤ │
│  close_proposal ──────────────── reveal_tally circuit ──────┤ │
│                                                              ↓ │
│                          Proposal PDA                          │
│         running_tally_ciphertext  (Enc<Mxe, i64>)             │
│         result: Option<i64>       (revealed at close)          │
└────────────────────────────────────────────────────────────────┘
                              ↕ CPI
┌────────────────────────────────────────────────────────────────┐
│                     Arcium MPC Cluster                         │
│                                                                │
│  zero_tally()        → Enc<Mxe, 0i64>                         │
│  add_vote(tally, v, w) → Enc<Mxe, tally + w*(2v-1)>           │
│  reveal_tally(tally) → i64  (plaintext, with proof)            │
└────────────────────────────────────────────────────────────────┘
```

### Three MPC Circuits (`encrypted-ixs/tally.rs`)

| Circuit | Inputs | Output | Called When |
|---|---|---|---|
| `zero_tally` | — | `Enc<Mxe, i64>` = 0 | Proposal created |
| `add_vote` | `Enc<Mxe, i64>` tally, `Enc<Shared, u8>` direction, `i64` weight | `Enc<Mxe, i64>` | Each vote |
| `reveal_tally` | `Enc<Mxe, i64>` tally | `i64` (plaintext) | Proposal closed |

### On-chain Accounts

| Account | PDA Seeds | Purpose |
|---|---|---|
| `Proposal` | `[b"proposal", creator, nonce_le_bytes]` | Proposal metadata + encrypted tally |
| `VoterCredits` | `[b"voter_credits", voter]` | Quadratic voting budget per voter (Power) |
| `VoterRecord` | `[b"voter_record", voter, proposal]` | Double-vote prevention |

---

## Privacy Guarantees

| What is revealed | What stays private |
|---|---|
| That a vote was cast (tx visible on-chain) | Which way the voter voted |
| How many votes a voter allocated (weight) | Their direction (For/Against) |
| Final net tally at close | Any intermediate count |
| Whether the proposal passed | Individual contributions |

The vote direction is encrypted client-side using **x25519 ECDH + RescueCipher** before the transaction is submitted. The MPC cluster adds the encrypted contribution to the running tally without learning the direction — the branchless circuit evaluates both `+weight` and `-weight` simultaneously and selects the correct result under encryption.

---

## Quadratic Voting Example

| Votes allocated | Power spent | Power remaining (from 100) |
|---|---|---|
| 1 | 1 | 99 |
| 3 | 9 | 91 |
| 5 | 25 | 75 |
| 10 | 100 | 0 |

A voter with 100 Power can cast 10 votes on one proposal, or spread their influence: e.g. 7 votes (49 Power) on one proposal and 7 votes (49 Power) on another (total 98 Power, 2 left over).

---

## Getting Started

### Prerequisites

```bash
# Install Arcium toolchain
curl --proto '=https' --tlsv1.2 -sSfL https://install.arcium.com/ | bash

# Verify
arcium --version   # 0.8.5
anchor --version   # 0.32.1
node --version     # 20+
```

### Build

```bash
cd private-voting
yarn install
arcium build
```

### Test (local)

```bash
arcium test
```

### Deploy to Devnet

```bash
arcium deploy \
  --cluster-offset 456 \
  --recovery-set-size 5 \
  -k ~/.config/solana/id.json \
  --program-keypair target/deploy/private_voting-keypair.json \
  --program-name private_voting \
  -u devnet
```

> [!NOTE]
> **Arcium v0.9.x Migration Notes**:
> - Use `-k` instead of `-kp` for the keypair flag.
> - The `--authority` flag is removed; the MXE authority is now always set to the signer (the keypair provided via `-k`).


After deploy, update `Anchor.toml` cluster to `devnet` and run:

```bash
arcium test --cluster devnet
```

### Run the Frontend

```bash
cd app
npm install
npm run dev   # → http://localhost:3001
```

Connect Phantom or Solflare (set to Devnet), register as a voter, and start creating proposals on the **Arcium Nocturne** dashboard.

---

## Proposal Lifecycle

```
creator → create_proposal()
       → zero_tally()         [MPC: generates Enc<Mxe,0>]
       ↓ status = Active

voters → cast_vote(Enc(direction), weight)   [up to deadline]
       → add_vote_callback()  [MPC: tally += weight*(2d-1)]

anyone → close_proposal()     [after end_time]
       → reveal_tally_callback() [MPC: reveals final i64]
       ↓ status = Finalized, result = net_tally
```

---

## Project Structure

```
private-voting/
├── Arcium.toml              # Arcium toolchain config
├── Anchor.toml              # Anchor + Solana config
├── encrypted-ixs/
│   └── tally.rs             # Three MPC circuits (zero_tally, add_vote, reveal_tally)
├── programs/
│   └── private-voting/
│       └── src/lib.rs       # Solana program (11 instructions)
├── tests/
│   └── private-voting.ts    # Full lifecycle integration tests (12/12 passing)
├── build/                   # Compiled Arcis circuits + generated TS wrappers
├── scripts/                 # Deployment, circuit upload, and debug utilities
└── app/                     # Frontend (Vite + React + Tailwind)
    ├── src/
    │   ├── lib/             # arcium.ts, encrypt.ts, pdas.ts
    │   ├── hooks/           # useProgram, useProposals, useVoterCredits
    │   └── components/      # WalletButton, ProposalCard, VoteModal, CreateProposalModal
    └── package.json
```

---

## Security Design

### Concurrent vote guard (`vote_in_flight`)

Arcium MPC computations are asynchronous — the callback arrives in a later transaction. Without a guard, two simultaneous `cast_vote` calls would both read the same stale `running_tally_ciphertext`; whichever callback lands second silently overwrites the first, losing a vote.

A `vote_in_flight: bool` flag on the proposal prevents this: the second voter gets `VoteInFlight` and must retry after the first callback clears the flag.

### Direction clamping in the circuit

The `add_vote` circuit uses `w * (2 * direction - 1)` to compute the contribution (`+w` for For, `-w` for Against). Without clamping, a voter who crafts a ciphertext that decrypts to `2` would inject `3w` instead of `w`.

The circuit clamps `new_vote` to `{0, 1}` before the formula runs:
```rust
let direction = if new_vote.to_arcis() >= 1u8 { 1i64 } else { 0i64 };
```

This is still branchless (both arms compute under encryption), so no voting information leaks.

---

## Why Arcium?

Traditional ZK-based private voting requires voters to generate proofs locally (expensive, complex tooling). Arcium's MPC approach:

- **No client-side ZK prover** — voters just encrypt and submit.
- **Correctness proof included** — the MPC cluster signs its output; the Solana program verifies the signature before accepting the result.
- **Composable** — the encrypted tally is a standard Solana PDA; any on-chain program can read the final result after reveal.
