import { PublicKey } from '@solana/web3.js';

export interface SwapCube {
  id: string;
  type: 'swap' | 'deposit' | 'withdraw' | 'arbitrage';
  dex?: DexType;
  tokenIn?: TokenInfo;
  tokenOut?: TokenInfo;
  amountIn?: number;
  pool?: string;
}

export type DexType = 'orca' | 'raydium' | 'meteora' | 'jupiter';

export interface TokenInfo {
  symbol: string;
  mint: string;
  decimals: number;
  logoURI?: string;
}

export interface ArbitrageOpportunity {
  id: string;
  path: SwapStep[];
  estimatedProfit: number;
  profitPercentage: number;
  requiredAmount: number;
  timestamp: number;
}

export interface SwapStep {
  dex: DexType;
  from: TokenInfo;
  to: TokenInfo;
  pool: string;
  expectedOutput: number;
}

export interface VaultInfo {
  totalShares: number;
  totalValue: number;
  userShares: number;
  userValue: number;
  apy: number;
}

export interface ComboState {
  cubes: SwapCube[];
  isExecuting: boolean;
  estimatedOutput?: number;
}
