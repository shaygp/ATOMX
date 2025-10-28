export interface DevnetArbitrageOpportunity {
  id: string;
  tokenA: {
    symbol: string;
    mint: string;
    decimals: number;
  };
  tokenB: {
    symbol: string;
    mint: string;
    decimals: number;
  };
  poolA: {
    dex: string;
    priceAtoB: number;
  };
  poolB: {
    dex: string;
    priceAtoB: number;
  };
  profitPercent: number;
  estimatedProfitUSD: number;
  inputAmount: number;
  timestamp: number;
}

const DEVNET_JUNO = {
  symbol: 'JUNO',
  mint: '379QrWjSPv16vrap3kFKb8qhMdNdXgmew9Gs8PcLQBhn',
  decimals: 9,
};

const DEVNET_ORCA = {
  symbol: 'ORCA',
  mint: 'J389KV6wdgvViBTSEAWDoAKDk772JaxD9WTemLgULLCZ',
  decimals: 9,
};

export function generateDevnetOpportunity(): DevnetArbitrageOpportunity {
  const baseProfit = 0.5 + Math.random() * 2;
  const priceA = 100 + Math.random() * 5;
  const priceB = priceA * (1 + baseProfit / 100);

  return {
    id: `devnet-${Date.now()}`,
    tokenA: DEVNET_JUNO,
    tokenB: DEVNET_ORCA,
    poolA: {
      dex: 'raydium',
      priceAtoB: priceA,
    },
    poolB: {
      dex: 'orca',
      priceAtoB: priceB,
    },
    profitPercent: baseProfit,
    estimatedProfitUSD: (0.1 * baseProfit) / 100 * priceA,
    inputAmount: 0.1,
    timestamp: Date.now(),
  };
}

export function startDevnetScanner(
  onOpportunityFound: (opp: DevnetArbitrageOpportunity) => void,
  intervalMs: number = 5000
): () => void {
  const opportunity = generateDevnetOpportunity();
  onOpportunityFound(opportunity);

  const interval = setInterval(() => {
    const newOpportunity = generateDevnetOpportunity();
    onOpportunityFound(newOpportunity);
  }, intervalMs);

  return () => clearInterval(interval);
}

export { executeDevnetArbitrageOnChain, checkDevnetTokenBalances } from './devnet-swap';
