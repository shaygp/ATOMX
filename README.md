# ATOMX Decentralized Arbitrage Execution Protocol

## THE SYSTEM 

We have built for the Colosseum Hackathon 2025 a decentralized arbitrage execution platform on Solana. ATOMX is using Jupiter V6 aggregator for swap routing. The  architecture is of three systems operating in a distributed computing model:

```
┌─────────────────────────────────────────────────────────────────┐
│                         ATOMX Protocol                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │   On-Chain   │  │   Scanner    │  │   Frontend DApp     │    │
│  │   Programs   │  │   Service    │  │                     │    │
│  │              │  │              │  │                     │    │
│  │  - Vault     │◄─┤  - WS API    │◄─┤  Next.js 15         │    │
│  │  - Router    │  │  - Detector  │  │  - Anchor Client    │    │
│  │              │  │  - Jupiter   │  │  - Wallet Adapter   │    │
│  └──────────────┘  └──────────────┘  └─────────────────────┘    │
│         │                  │                    │               │
│         └──────────────────┴────────────────────┘               │
│                            │                                    │
│                    Solana Blockchain                            │
│                   (Devnet/Mainnet-Beta)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Technical 

### Blockchain Infrastructure
- **Network**: Solana (Devnet: `devnet`, Mainnet-Beta)
- **Smart Contract Framework**: Anchor 0.32.1
- **Programming Language**: Rust (Edition 2021)
- **VM**: Solana BPF (Berkeley Packet Filter)
- **Toolchain**: solana-cli 1.18+, anchor-cli 0.32.1

### Backend 
- **Runtime**: Node.js 22.x
- **Framework**: Express.js 4.x
- **WebSocket Protocol**: ws 8.x
- **Language**: TypeScript 5.x
- **Process Manager**: PM2 / Heroku Dynos

### Frontend 
- **Framework**: Next.js 15.5.0 (App Router)
- **UI Framework**: React 18.3.1
- **Styling**: TailwindCSS 3.4.15
- **State Management**: Tanstack Query v5
- **Animation**: Framer Motion 11.15
- **Wallet Integration**: @solana/wallet-adapter 0.9.x

## On-Chain 

### 1. Vault Program
**Program ID**: `6Y9Zhzdpfjt7qL59WA1Q8WMVRVoXhdpcTKKP1Uw4FLXz`

#### Architecture
The vault implements a share liquidity pool system for collective arbitrage execution. Its using Program Derived Addresses for authority delegation and atomic transaction execution.

#### Instructions

##### `initialize_vault`
Creates the vault PDA and sets up initial state.

**Accounts**:
- `vault` (PDA, seeds: `["vault"]`): Main vault state account
- `authority`: Vault administrator (signer)
- `swap_router`: Authorized router program reference
- `system_program`: Solana system program

**State**:
```rust
pub struct Vault {
    authority: Pubkey,      // 32 bytes
    swap_router: Pubkey,    // 32 bytes
    total_shares: u64,      // 8 bytes
    bump: u8,               // 1 byte
}
```

##### `deposit`
Deposits wrapped SOL (wSOL) and mints proportional vault shares.

**Algorithm**:
```
if total_shares == 0:
    shares = amount
else:
    shares = (amount * total_shares) / vault_balance
```

**Overflow Protection**: All arithmetic operations use checked math with explicit overflow handling.

**Accounts**:
- `vault`: Vault state (mut)
- `user_position` (PDA, seeds: `["position", user_pubkey]`): User share tracking
- `user_token`: User's wSOL ATA (mut)
- `vault_token`: Vault's wSOL ATA (mut)
- `token_program`: SPL Token program

##### `execute_arbitrage`
Executes atomic arbitrage through cross-program invocation (CPI) to swap router.

**Parameters**:
- `jupiter_instruction_data: Vec<u8>`: Serialized Jupiter swap instruction
- `min_profit: u64`: Minimum required profit in lamports

**Execution Flow**:
1. **Pre-execution Validation**:
   - Verify token mint == wSOL (`So11111111111111111111111111111111111111112`)
   - Validate initial vault balance > 0
   - Ensure min_profit > 0

2. **CPI Execution**:
   ```rust
   swap_router::cpi::execute_vault_jupiter_swap(
       cpi_ctx.with_remaining_accounts(remaining_accounts),
       jupiter_instruction_data,
       vault_seeds
   )
   ```

3. **Post-execution Validation**:
   - Reload vault token account
   - Calculate profit: `final_balance - initial_balance`
   - Require: `profit >= min_profit`

4. **Fee Distribution** (10% executor incentive):
   ```
   executor_fee = profit * 10 / 100
   vault_profit = profit - executor_fee
   ```

##### `withdraw`
Burns vault shares and returns proportional wSOL.

**Algorithm**:
```
if shares == total_shares:
    amount = vault_balance  // Complete withdrawal
else:
    amount = (shares * vault_balance) / total_shares  // Proportional
```

**Constraints**:
- User must have sufficient shares
- Uses checked math to prevent precision loss
- Emits `Withdrawn` event for indexing

#### Events
```rust
#[event]
pub struct Deposited {
    user: Pubkey,
    amount: u64,
    shares: u64,
}

#[event]
pub struct ArbitrageExecuted {
    executor: Pubkey,
    profit: u64,
    executor_fee: u64,
    vault_profit: u64,
}

#[event]
pub struct Withdrawn {
    user: Pubkey,
    amount: u64,
    shares: u64,
}
```

### 2. Swap Router Program
**Program ID**: `AgcU7r6U5uPEfFccmhYdMLcjckADdfoJ8QcHCgkG74Zg`

#### Purpose
Abstracts Jupiter V6 integration for a unified interface for both user initiated and vault authorized swaps.

#### Instructions

##### `initialize_router`
**Parameters**:
- `fee_rate_bps: u16`: Fee rate in basis points (max 1000 = 10%)

**State**:
```rust
pub struct RouterState {
    authority: Pubkey,      // 32 bytes
    fee_rate_bps: u16,      // 2 bytes (100 = 1%)
    total_swaps: u64,       // 8 bytes
    total_volume: u64,      // 8 bytes
    bump: u8,               // 1 byte
}
// Total: 51 bytes + 8 byte discriminator
```

##### `execute_jupiter_swap`
Standard user swap execution.

**Implementation**:
```rust
let jupiter_ix = Instruction {
    program_id: JUPITER_V6,
    accounts: remaining_accounts.to_account_metas(),
    data: jupiter_instruction_data,
};

invoke_signed(&jupiter_ix, remaining_accounts, &[])?;
```

**Constraints**:
- Jupiter program must be `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`
- Instruction data cannot be empty
- User must sign transaction

##### `execute_vault_jupiter_swap`
Vault-authorized swap with PDA signing.

**Parameters**:
- `jupiter_instruction_data: Vec<u8>`
- `vault_seeds: Vec<Vec<u8>>`: PDA derivation seeds

**PDA Signing**:
```rust
let seed_slices: Vec<&[u8]> = vault_seeds.iter()
    .map(|s| s.as_slice())
    .collect();
let signer_seeds = &[seed_slices.as_slice()];

invoke_signed(&jupiter_ix, remaining_accounts, signer_seeds)?;
```

**Security**:
- Only callable via CPI from vault program
- Prevents unauthorized fund access
- Maintains atomic execution 

## Scanner 

### Architecture
The scanner is a live rbitrage detection system that checks price differentials on DEXs using Jupiter's price API and quote aggregation.

**Service Endpoint**: `https://atomx-scanner-a6f0bb793aa4.herokuapp.com/`

### API Endpoints

#### WebSocket API
**Endpoint**: `ws://[host]/ws/scanner`

**Message Types**:
```typescript
// Client → Server
{
  type: 'subscribe',
  pairs: ['SOL/USDC', 'SOL/USDT']
}

// Server → Client
{
  type: 'opportunity',
  data: ArbitrageOpportunity
}

{
  type: 'stats',
  data: ScannerStats
}
```

#### REST API

##### `POST /api/scanner/start`
Initiates continuous scanning.

**Request**:
```json
{
  "pairs": [
    { "input": "SOL", "output": "USDC" },
    { "input": "USDC", "output": "USDT" }
  ],
  "config": {
    "scanInterval": 5000,
    "minProfitUSD": 1.0,
    "minProfitPercentage": 0.5,
    "maxPriceImpact": 1.0,
    "testVolume": 1000
  }
}
```

**Response**:
```json
{
  "status": "started",
  "scanInterval": 5000,
  "timestamp": "2025-10-29T12:00:00Z"
}
```

##### `GET /api/scanner/opportunities`
Retrieves detected opportunities (last 100).

**Response**:
```json
{
  "opportunities": [
    {
      "tokenA": { "symbol": "SOL", "mint": "So11..." },
      "tokenB": { "symbol": "USDC", "mint": "EPjF..." },
      "buyDEX": {
        "name": "Raydium",
        "price": 150.23,
        "outputAmount": 150230000,
        "priceImpact": 0.15,
        "route": ["SOL", "USDC"]
      },
      "sellDEX": {
        "name": "Orca",
        "price": 151.45,
        "outputAmount": 151450000,
        "priceImpact": 0.12,
        "route": ["USDC", "SOL"]
      },
      "profitUSD": 12.20,
      "profitPercentage": 0.81,
      "volume": 1000,
      "timestamp": 1730203200000,
      "confidence": 0.85
    }
  ],
  "count": 1
}
```

##### `GET /api/scanner/status`
Returns scanner operational state.

**Response**:
```json
{
  "isScanning": true,
  "config": { ... },
  "stats": {
    "totalScans": 1523,
    "opportunitiesFound": 47,
    "successRate": 3.08,
    "uptime": 3600
  }
}
```

### Arbitrage Detection Algorithm

#### Price Aggregation
```typescript
// Fetch prices from Jupiter for all DEX routes
const forwardQuote = await jupiterAPI.getQuote({
  inputMint: tokenA.mint,
  outputMint: tokenB.mint,
  amount: testVolume,
  slippageBps: 50
});

const reverseQuote = await jupiterAPI.getQuote({
  inputMint: tokenB.mint,
  outputMint: tokenA.mint,
  amount: forwardQuote.outAmount,
  slippageBps: 50
});
```

#### Opportunity Detection
```typescript
const profitPercentage = ((bestSellPrice - bestBuyPrice) / bestBuyPrice) * 100;

// Fee calculation
const jupiterFee = volume * (JUPITER_FEE_BPS / 10000);      // 0.25%
const platformFee = volume * (PLATFORM_FEE_BPS / 10000);    // 0.10%
const executorFee = grossProfit * (EXECUTOR_FEE_BPS / 10000); // 10%

const networkFees = 0.000005 * SOL_PRICE_USD * 2; // ~2 transactions

const netProfit = grossProfit - jupiterFee - platformFee
                  - executorFee - networkFees;

// Opportunity validation
if (netProfit >= config.minProfitUSD &&
    profitPercentage >= config.minProfitPercentage) {
  return opportunity;
}
```

#### Confidence 
```typescript
const confidence = Math.min(
  1.0,
  (1 - buyDEX.priceImpact / config.maxPriceImpact) * 0.4 +
  (1 - sellDEX.priceImpact / config.maxPriceImpact) * 0.4 +
  (profitPercentage / config.minProfitPercentage) * 0.2
);
```

### WebSocket Implementation
- **Protocol**: WSS (WebSocket Secure) over TLS 1.3
- **Heartbeat**: 30-second ping/pong for connection management
- **Reconnection**: Exponential backoff (1s → 2s → 4s → 8s → 16s max)
- **Message Queue**: In-memory circular buffer (1000 messages)
- **Compression**: Per-message deflate compression

## Frontend 

### Application Structure
```
app/
├── (root)/
│   └── page.tsx              # Landing page
├── arbitrage/
│   └── page.tsx              # Opportunity dashboard
├── vault/
│   └── page.tsx              # Vault management
├── combo/
│   └── page.tsx              # Strategy builder
└── api/
    └── staking/route.ts      # Server-side API routes
```

### State Management

#### Wallet Context
```typescript
interface WalletContextType {
  publicKey: PublicKey | null;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>;
  connected: boolean;
}
```

#### Anchor Program Integration
```typescript
// programs/vault.ts
const vaultProgram = new Program(
  IDL,
  new PublicKey('6Y9Zhzdpfjt7qL59WA1Q8WMVRVoXhdpcTKKP1Uw4FLXz'),
  provider
);

const [vaultPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('vault')],
  vaultProgram.programId
);

const depositIx = await vaultProgram.methods
  .deposit(new BN(amount))
  .accounts({
    vault: vaultPDA,
    userPosition,
    user: wallet.publicKey,
    userToken,
    vaultToken,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .instruction();
```

### Hooks Architecture

#### `useVault()`
Manages vault interactions with React Query caching.

```typescript
interface VaultData {
  balance: number;
  shares: number;
  totalShares: number;
  sharePrice: number;
}

const { data, isLoading, refetch } = useVault();
```

**Features**:
- Auto-refresh every 10 seconds
- Optimistic updates for deposits/withdrawals
- Transaction confirmation polling

#### `useScanner()`
WebSocket connection management for real-time opportunities.

```typescript
const {
  opportunities,
  isConnected,
  latency,
  subscribe,
  unsubscribe
} = useScanner();
```

**Implementation**:
- Automatic reconnection on disconnect
- Message deduplication by opportunity ID
- Exponential backoff retry logic
- Local buffer for offline resilience

#### `useArbitrage()`
Arbitrage execution and validation.

```typescript
const {
  execute,
  isExecuting,
  lastResult
} = useArbitrage();

await execute({
  opportunity,
  slippageBps: 50,
  priorityFee: 0.001
});
```

**Safety Checks**:
1. Wallet connection validation
2. Sufficient balance verification
3. Slippage tolerance enforcement
4. Transaction simulation pre-flight
5. Post-execution profit verification

### Transaction Construction

#### Jupiter Swap Integration
```typescript
// 1. Get Jupiter quote
const quoteResponse = await fetch(
  `https://quote-api.jup.ag/v6/quote?` +
  `inputMint=${inputMint}&` +
  `outputMint=${outputMint}&` +
  `amount=${amount}&` +
  `slippageBps=${slippageBps}`
).then(r => r.json());

// 2. Get swap transaction
const { swapTransaction } = await fetch('https://quote-api.jup.ag/v6/swap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    quoteResponse,
    userPublicKey: wallet.publicKey.toString(),
    wrapUnwrapSOL: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto'
  })
}).then(r => r.json());

// 3. Deserialize and sign
const transaction = VersionedTransaction.deserialize(
  Buffer.from(swapTransaction, 'base64')
);
const signed = await wallet.signTransaction(transaction);

// 4. Send with confirmation
const signature = await connection.sendRawTransaction(signed.serialize());
await connection.confirmTransaction(signature, 'confirmed');
```

## Development Setup

### Prerequisites
```bash
# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.22/install)"

# Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.32.1
avm use 0.32.1

# Node.js (via nvm)
nvm install 22
nvm use 22
```

### Build & Deploy Programs

#### Local Development
```bash
# Start local validator with required programs
solana-test-validator \
  --bpf-program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 \
  ./jupiter-v6.so \
  --reset

# Build programs
cd backend
anchor build

# Deploy to localnet
anchor deploy

# Run tests
anchor test --skip-local-validator
```

#### Devnet Deployment
```bash
# Configure CLI
solana config set --url devnet
solana config set --keypair ~/.config/solana/id.json

# Airdrop for testing
solana airdrop 2

# Build and deploy
anchor build
anchor deploy --provider.cluster devnet

# Verify deployment
solana program show 6Y9Zhzdpfjt7qL59WA1Q8WMVRVoXhdpcTKKP1Uw4FLXz
```

### Scanner 

#### Local Development
```bash
cd backend/scanner/api
npm install

# Environment configuration
cat > .env << EOF
PORT=3002
SOLANA_RPC_URL=https://api.devnet.solana.com
JUPITER_API_URL=https://quote-api.jup.ag/v6
SCAN_INTERVAL=5000
MIN_PROFIT_USD=1.0
MAX_PRICE_IMPACT=1.0
EOF

# Start service
npm run dev

# WebSocket test
wscat -c ws://localhost:3002/ws/scanner
```

#### Heroku Deployment
```bash
# Add Heroku remote
git remote add heroku https://git.heroku.com/atomx-scanner.git

# Configure environment
heroku config:set SOLANA_RPC_URL=https://api.devnet.solana.com
heroku config:set NODE_ENV=production

# Deploy
git push heroku main

# Monitor logs
heroku logs --tail --app atomx-scanner
```

### Frontend 

```bash
cd frontend
npm install

# Environment setup
cat > .env.local << EOF
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_VAULT_PROGRAM_ID=6Y9Zhzdpfjt7qL59WA1Q8WMVRVoXhdpcTKKP1Uw4FLXz
NEXT_PUBLIC_ROUTER_PROGRAM_ID=AgcU7r6U5uPEfFccmhYdMLcjckADdfoJ8QcHCgkG74Zg
NEXT_PUBLIC_SCANNER_WS_URL=ws://localhost:3002/ws/scanner
EOF

# Development server
npm run dev

# Production build
npm run build
npm run start
```

# E2E tests
npm run test:e2e

# Build verification
npm run build
```

## Monitoring & Observability

### Program Events
Monitor via Solana logs:
```bash
solana logs --url devnet | grep "Program 6Y9Zhzdp"
```

### Scanner Metrics
```bash
curl https://atomx-scanner-a6f0bb793aa4.herokuapp.com/api/ws/stats
```

**Response**:
```json
{
  "connections": 42,
  "messagesPerSecond": 15,
  "averageLatency": 120,
  "opportunitiesDetected": 1523
}
```

### Heroku Monitoring
```bash
heroku logs --tail --app atomx-scanner
heroku ps --app atomx-scanner
heroku metrics --app atomx-scanner
```

### Compute Unit Limits
```typescript
// Priority fee calculation
const priorityFee = baseFee * (1 + volatilityMultiplier);

// Compute budget
const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
  units: 400000
});

const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({
  microLamports: priorityFee
});
```

### Error Handling
```typescript
try {
  await executeArbitrage(opportunity);
} catch (error) {
  if (error instanceof SendTransactionError) {
    // Parse transaction error logs
    const logs = error.logs || [];
    const programError = parseProgramError(logs);

    if (programError === 'InsufficientProfit') {
      // Opportunity expired
    }
  }
}
```

## Gas Optimization

### Transaction Composition
```typescript
// Batch instructions for atomic execution
const tx = new Transaction()
  .add(computeBudgetIx)
  .add(computePriceIx)
  .add(depositIx)
  .add(executeArbitrageIx);

// Optimize signatures
tx.feePayer = wallet.publicKey;
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
```

### Account Lookup Tables (ALT)
```typescript
const lookupTableAddress = await connection.getAddressLookupTable(
  new PublicKey('...')
);

const versionedTx = new VersionedTransaction(
  message.compileToV0Message([lookupTableAddress])
);
```

## API Rate Limits

| Endpoint | Rate Limit | Burst |
|----------|-----------|-------|
| Jupiter Quote API | 10/sec | 20 |
| Solana RPC (Free) | 3/sec | 10 |
| Solana RPC (Paid) | 100/sec | 200 |
| Scanner WebSocket | 1000 msg/sec | 2000 |


