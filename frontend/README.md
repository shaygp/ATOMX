# AtomX Interface

Next.js 15 app for Solana arbitrage execution and vault management with live scanner.

## Architecture

### Application Structure

```
AtomX-frontend/
├── app/                    # Next.js 15 App Router
│   ├── arbitrage/         # Real-time scanner UI
│   ├── combo/             # Drag-drop strategy builder
│   └── vault/             # Vault management interface
├── components/            # React components
├── contexts/              # Wallet + Phantom integration
├── hooks/                 # React hooks for Solana programs
├── lib/                   # Anchor client + transaction builders
│   ├── anchor/           # Program adapters
│   ├── idl/              # Program IDL files
│   └── scanner-api.ts    # Scanner WebSocket client
└── types/                # TypeScript definitions
```

### Tech Stack

**Framework:**
- Next.js 15.5.0 (App Router)
- React 18.3.1
- TypeScript 5.7.2

**Solana:**
- @solana/web3.js 1.98.0
- @solana/wallet-adapter-react 0.15.35
- @coral-xyz/anchor 0.32.1
- @solana/spl-token 0.4.14

**UI:**
- TailwindCSS 3.4.15
- Framer Motion 11.15.0
- @dnd-kit 6.3.1 (drag-drop)
- Recharts 2.14.1 (visualizations)

### Key Features

#### 1. Real-Time Arbitrage Scanner

Connected to Heroku scanner API via WebSocket.

**Implementation:**
```typescript
// lib/scanner-api.ts
export class ScannerAPI {
  private ws: WebSocket | null = null;

  connectWebSocket(
    onMessage: (data: any) => void,
    onError?: (error: Event) => void,
    onClose?: () => void
  ): void {
    const wsUrl = process.env.NEXT_PUBLIC_SCANNER_API_URL
      .replace(/^http/, 'ws');
    this.ws = new WebSocket(`${wsUrl}/ws/scanner`);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };
  }
}
```

**Message Types:**
- `log`: Scanner console output (PRICE, ROUTE, SCAN categories)
- `opportunity`: Arbitrage opportunity detected
- `status`: Scanner state update
- `scan_complete`: Full scan cycle finished

**UI Components:**
```typescript
// app/arbitrage/page.tsx
const { opportunities, status, connected } = useScanner(
  handleScannerLog,
  handleOpportunityAlert
);
```

Real-time log streaming with category filtering:
- `[PRICE]`: Token price updates
- `[ROUTE]`: Jupiter quote generation
- `[SCAN]`: Opportunity detection results

#### 2. Vault Management

Direct interaction with vault program via Anchor client.

**Deposit Flow:**
```typescript
// lib/vault-transactions.ts
export async function depositToVault(
  provider: AnchorProvider,
  vaultPubkey: PublicKey,
  tokenMint: PublicKey,
  amount: BN
): Promise<string>
```

Transaction structure:
1. Get/create user position PDA: `["user_position", vault, user]`
2. Get vault token ATA: `getAssociatedTokenAddress(tokenMint, vault, true)`
3. Build deposit instruction with Anchor client
4. Submit transaction with Phantom wallet

**Arbitrage Execution:**
```typescript
// lib/execution.ts
export async function executeArbitrage(
  provider: AnchorProvider,
  opportunity: ArbitrageOpportunity,
  vaultPubkey: PublicKey
): Promise<string>
```

Transaction building:
1. Fetch Jupiter quote for optimal route
2. Deserialize Jupiter instruction data
3. Extract all Jupiter accounts from quote
4. Build vault arbitrage instruction:
   - Vault program as entry point
   - Router program as CPI target
   - Jupiter program as nested CPI
   - All token accounts + associated PDAs
5. Set compute budget: 200k units + priority fee
6. Submit with wallet confirmation

#### 3. Combo Strategy Builder

Visual drag-drop interface for multi-step DeFi strategies.

**Components:**
- `SwapCube`: Draggable swap operation blocks
- DnD Kit sortable integration
- Real-time price validation via Jupiter

**Planned Flow:**
```
User drags: [Swap SOL→USDC] → [Swap USDC→USDT] → [Swap USDT→SOL]
Frontend validates: Route feasibility + slippage
Execution: Atomic transaction bundle
```

### Program Integration

#### Anchor Client Setup

```typescript
// lib/anchor/provider.ts
export function getProvider(
  connection: Connection,
  wallet: WalletContextState
): AnchorProvider {
  return new AnchorProvider(
    connection,
    wallet as AnchorWallet,
    { commitment: 'confirmed' }
  );
}
```

#### Vault Program Adapter

```typescript
// lib/anchor/vault.ts
export function getVaultProgram(
  provider: AnchorProvider
): Program<VaultIDL> {
  return new Program(VaultIDL, provider);
}
```

IDL loaded from `lib/idl/vault.json` (generated via `anchor build`).

#### Router Program Adapter

```typescript
// lib/anchor/swap-router.ts
export function getRouterProgram(
  provider: AnchorProvider
): Program<SwapRouterIDL> {
  return new Program(SwapRouterIDL, provider);
}
```

### React Hooks

#### useScanner

Real-time scanner integration with WebSocket.

```typescript
export function useScanner(
  onLogMessage?: (log: any) => void,
  onOpportunityMessage?: (opportunity: any) => void
): UseScanner {
  const [isRunning, setIsRunning] = useState(false);
  const [opportunities, setOpportunities] = useState([]);
  const [connected, setConnected] = useState(false);

  // Health check every 10s
  useEffect(() => {
    const checkHealth = async () => {
      const healthy = await scannerAPI.healthCheck();
      setConnected(healthy);
    };
    const healthInterval = setInterval(checkHealth, 10000);
    return () => clearInterval(healthInterval);
  }, []);

  // WebSocket connection
  useEffect(() => {
    if (!connected) return;
    scannerAPI.connectWebSocket(
      handleWebSocketMessage,
      handleWebSocketError,
      handleWebSocketClose
    );
    return () => scannerAPI.disconnectWebSocket();
  }, [connected]);

  return {
    isRunning,
    opportunities,
    connected,
    startScanner,
    stopScanner,
    manualScan,
    getStatus,
  };
}
```

#### useVault

Vault state management + transaction execution.

```typescript
export function useVault(vaultPubkey: PublicKey) {
  const { publicKey, connected } = useWallet();
  const [vaultData, setVaultData] = useState<VaultAccount | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) return;

    const fetchVaultData = async () => {
      const program = getVaultProgram(provider);
      const vault = await program.account.vault.fetch(vaultPubkey);
      setVaultData(vault);

      const [userPositionPDA] = findProgramAddressSync(
        [Buffer.from("user_position"), vaultPubkey.toBuffer(), publicKey.toBuffer()],
        program.programId
      );
      const position = await program.account.userPosition.fetch(userPositionPDA);
      setUserPosition(position);
    };

    fetchVaultData();
    const interval = setInterval(fetchVaultData, 10000);
    return () => clearInterval(interval);
  }, [connected, publicKey, vaultPubkey]);

  return { vaultData, userPosition, deposit, withdraw, executeArbitrage };
}
```

#### useArbitrage

Opportunity filtering + execution tracking.

```typescript
export function useArbitrage(minProfit: number, enableScan: boolean) {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enableScan) return;

    const scanForOpportunities = async () => {
      setLoading(true);
      const opps = await scannerAPI.getOpportunities();
      const filtered = opps.filter(o => o.profitUSD >= minProfit);
      setOpportunities(filtered);
      setLoading(false);
    };

    scanForOpportunities();
    const interval = setInterval(scanForOpportunities, 30000);
    return () => clearInterval(interval);
  }, [minProfit, enableScan]);

  return { opportunities, loading, refresh };
}
```

### Transaction Building

#### Vault Arbitrage Transaction

Complex multi-account transaction with dynamic Jupiter accounts.

```typescript
export async function buildArbitrageTransaction(
  provider: AnchorProvider,
  vaultPubkey: PublicKey,
  jupiterQuote: JupiterQuote
): Promise<Transaction> {
  const vaultProgram = getVaultProgram(provider);
  const routerProgram = getRouterProgram(provider);

  // Get all PDAs
  const [vaultPDA] = findProgramAddressSync(
    [Buffer.from("vault")],
    vaultProgram.programId
  );

  const [routerStatePDA] = findProgramAddressSync(
    [Buffer.from("router_state")],
    routerProgram.programId
  );

  // Get token accounts
  const vaultTokenAccount = await getAssociatedTokenAddress(
    WSOL_MINT,
    vaultPDA,
    true
  );

  const executorTokenAccount = await getAssociatedTokenAddress(
    WSOL_MINT,
    provider.wallet.publicKey
  );

  // Parse Jupiter instruction
  const jupiterIx = deserializeJupiterInstruction(jupiterQuote);

  // Build arbitrage instruction
  const tx = await vaultProgram.methods
    .executeArbitrage(jupiterIx.data, new BN(minProfit))
    .accounts({
      vault: vaultPDA,
      vaultToken: vaultTokenAccount,
      executor: provider.wallet.publicKey,
      executorToken: executorTokenAccount,
      swapRouterProgram: routerProgram.programId,
      routerState: routerStatePDA,
      jupiterProgram: JUPITER_V6_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .remainingAccounts(jupiterIx.accounts)
    .transaction();

  // Set compute budget
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })
  );

  return tx;
}
```

### Configuration

#### Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SCANNER_API_URL=https://atomx-scanner-a6f0bb793aa4.herokuapp.com
NEXT_PUBLIC_VAULT_PROGRAM_ID=2ea7vwH3ziuFKC2DBwp81MjQpkTTbf4nhNefedcKREDy
NEXT_PUBLIC_SWAP_ROUTER_PROGRAM_ID=AgcU7r6U5uPEfFccmhYdMLcjckADdfoJ8QcHCgkG74Zg
```

#### Wallet Configuration

Phantom wallet required for transaction signing.

```typescript
// contexts/WalletContext.tsx
const wallets = useMemo(
  () => [new PhantomWalletAdapter()],
  []
);

return (
  <ConnectionProvider endpoint={RPC_URL}>
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        {children}
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
);
```

### Development

#### Local Development

```bash
npm install
npm run dev
```

Server starts on `http://localhost:3000`.

Hot reload enabled for all file changes.

#### Build for Production

```bash
npm run build
```

Optimized production bundle in `.next/` directory.

#### Deploy to Vercel

```bash
vercel --prod
```

Automatic deployments on `git push` to main branch.

Environment variables configured in Vercel dashboard.

### UI Components

#### ArbitrageCard

Displays opportunity with execution button.

```typescript
interface ArbitrageCardProps {
  opportunity: ArbitrageOpportunity;
  onExecute: (opportunity: ArbitrageOpportunity) => void;
  executing: boolean;
}

export function ArbitrageCard({ opportunity, onExecute, executing }: ArbitrageCardProps) {
  return (
    <div className="cyber-card p-4">
      <div className="flex justify-between">
        <div>
          <p className="text-[#9333ea]">{opportunity.inputToken} → {opportunity.outputToken}</p>
          <p className="text-white">${opportunity.profitUSD.toFixed(2)} profit</p>
          <p className="text-gray-400">{opportunity.profitPercentage.toFixed(2)}%</p>
        </div>
        <button
          onClick={() => onExecute(opportunity)}
          disabled={executing}
          className="border border-[#9333ea] px-4 py-2 text-[#9333ea] hover:bg-[#9333ea] hover:text-black"
        >
          {executing ? 'EXECUTING...' : 'EXECUTE'}
        </button>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Route: {opportunity.route.map(r => r.label).join(' → ')}
      </div>
    </div>
  );
}
```

#### MatrixRain

Animated background effect.

```typescript
export function MatrixRain() {
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#9333ea';
      ctx.font = '15px monospace';

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * 20, drops[i] * 20);

        if (drops[i] * 20 > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    const interval = setInterval(draw, 33);
    return () => clearInterval(interval);
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10" />;
}
```

### Error 

#### Transaction Failures

```typescript
try {
  const signature = await executeArbitrage(provider, opportunity, vaultPubkey);
  await provider.connection.confirmTransaction(signature, 'confirmed');
  console.log('Arbitrage executed:', signature);
} catch (error) {
  if (error.message.includes('InsufficientProfit')) {
    console.error('Profit below minimum threshold');
  } else if (error.message.includes('InsufficientVaultBalance')) {
    console.error('Vault lacks sufficient balance');
  } else if (error.message.includes('User rejected')) {
    console.error('Transaction rejected by user');
  } else {
    console.error('Arbitrage execution failed:', error);
  }
}
```

#### WebSocket Reconnection

```typescript
const handleWebSocketClose = () => {
  console.log('Scanner WebSocket closed');
  wsConnectedRef.current = false;

  // Exponential backoff reconnection
  setTimeout(() => {
    if (connected) {
      scannerAPI.connectWebSocket(
        handleWebSocketMessage,
        handleWebSocketError,
        handleWebSocketClose
      );
    }
  }, 5000);
};
```

### Performance Optimizations

#### React Query Integration

```typescript
// hooks/useJupiterPrice.ts
export function useJupiterPrice(tokenMints: string[]) {
  return useQuery({
    queryKey: ['jupiter-prices', tokenMints],
    queryFn: async () => {
      const response = await fetch(
        `https://lite-api.jup.ag/price/v3?ids=${tokenMints.join(',')}`
      );
      return response.json();
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });
}
```

#### Memoization

```typescript
const opportunities = useMemo(() => {
  return rawOpportunities.filter(o =>
    o.profitUSD >= minProfit &&
    o.priceImpact <= maxPriceImpact
  );
}, [rawOpportunities, minProfit, maxPriceImpact]);
```

### Security

#### Transaction Simulation

```typescript
const simulation = await provider.connection.simulateTransaction(tx);
if (simulation.value.err) {
  throw new Error('Transaction simulation failed');
}
```

#### Slippage Protection

Jupiter handles slippage internally via `slippageBps` parameter.

Frontend sets conservative defaults: 50 bps (0.5%).

#### Wallet Connection

```typescript
const { publicKey, signTransaction, signAllTransactions } = useWallet();

if (!publicKey) {
  throw new Error('Wallet not connected');
}

if (!signTransaction) {
  throw new Error('Wallet does not support transaction signing');
}
```

### Deployment

#### Vercel Configuration

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "env": {
    "NEXT_PUBLIC_SOLANA_RPC_URL": "@solana-rpc-url",
    "NEXT_PUBLIC_SCANNER_API_URL": "@scanner-api-url"
  }
}
```

#### Production URL

`[https://atomx-frontend-b1xkydqs3-shaygps-projects.vercel.app](https://atomx-frontend.vercel.app/)`

### Monitoring

#### Client-Side Logging

```typescript
console.log('[TX] Transaction signature:', signature);
console.log('[WALLET] Wallet connected:', publicKey.toBase58());
console.log('[SCANNER] WebSocket connected');
console.log('[OPPORTUNITY] New opportunity detected:', opportunity);
```

