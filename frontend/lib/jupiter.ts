import { TokenInfo, DexType } from '@/types';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';
const JUPITER_PRICE_API = 'https://price.jup.ag/v3';

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: JupiterRoutePlan[];
}

export interface JupiterRoutePlan {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

export interface TokenPrice {
  id: string;
  type: string;
  price: string;
  extraInfo?: {
    lastSwappedPrice?: string;
    quotedPrice?: string;
  };
}

export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 100,
  onlyDirectRoutes: boolean = false
): Promise<JupiterQuote | null> {
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
      ...(onlyDirectRoutes && { onlyDirectRoutes: 'true' })
    });

    const response = await fetch(`${JUPITER_QUOTE_API}/quote?${params}`);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return null;
  }
}

export async function getTokenPrices(tokenIds: string[]): Promise<Record<string, TokenPrice>> {
  try {
    const ids = tokenIds.join(',');
    const response = await fetch(`${JUPITER_PRICE_API}/price?ids=${ids}`);

    if (!response.ok) {
      return {};
    }

    const data = await response.json();
    return data.data || {};
  } catch (error) {
    return {};
  }
}

export async function findArbitrageOpportunities(
  tokenList: TokenInfo[],
  minProfitPercentage: number = -100
) {
  const opportunities = [];
  const MAX_CONCURRENT = 10;

  const pairs: Array<[TokenInfo, TokenInfo]> = [];
  for (let i = 0; i < tokenList.length; i++) {
    for (let j = 0; j < tokenList.length; j++) {
      if (i === j) continue;
      pairs.push([tokenList[i], tokenList[j]]);
    }
  }

  const amounts = [0.1, 0.25, 0.5, 1, 2];

  console.log(`Scanning ${pairs.length} pairs x ${amounts.length} amounts = ${pairs.length * amounts.length} total routes`);

  let scanned = 0;
  let found = 0;

  for (let i = 0; i < pairs.length; i += MAX_CONCURRENT) {
    const batch = pairs.slice(i, i + MAX_CONCURRENT);

    const batchResults = await Promise.all(
      batch.map(async ([tokenA, tokenB]) => {
        const results = [];

        for (const multiplier of amounts) {
          const baseAmount = tokenA.symbol === 'SOL' ? 100000000 :
                            tokenA.symbol === 'BONK' ? 100000000000 :
                            tokenA.symbol === 'JITO' ? 100000000 :
                            tokenA.symbol === 'MEW' ? 10000000000 :
                            100000000;

          const startAmount = Math.floor(baseAmount * multiplier);
          scanned++;

          try {
            const quote1 = await getJupiterQuote(tokenA.mint, tokenB.mint, startAmount, 50, false);
            if (!quote1) {
              console.log(`No route ${tokenA.symbol}->${tokenB.symbol} (${multiplier}x)`);
              continue;
            }

            const quote2Result = await getJupiterQuote(
              tokenB.mint,
              tokenA.mint,
              parseInt(quote1.outAmount),
              50,
              false
            );

            if (!quote2Result) {
              console.log(`No return ${tokenB.symbol}->${tokenA.symbol}`);
              continue;
            }

            const finalAmount = parseInt(quote2Result.outAmount);
            const profit = finalAmount - startAmount;
            const profitPercentage = (profit / startAmount) * 100;

            const tokenAPrice = await getTokenPriceUSD(tokenA.mint);
            const estimatedProfitUSD = (profit / Math.pow(10, tokenA.decimals)) * parseFloat(tokenAPrice);

            found++;
            console.log(`Found ${tokenA.symbol}->${tokenB.symbol}->${tokenA.symbol} (${multiplier}x): ${profitPercentage.toFixed(4)}% = $${estimatedProfitUSD.toFixed(2)}`);

            results.push({
              path: [
                {
                  dex: mapLabelToDex(quote1.routePlan[0]?.swapInfo.label || 'jupiter'),
                  from: tokenA,
                  to: tokenB,
                  pool: quote1.routePlan[0]?.swapInfo.ammKey || 'unknown',
                  expectedOutput: parseInt(quote1.outAmount) / Math.pow(10, tokenB.decimals),
                },
                {
                  dex: mapLabelToDex(quote2Result.routePlan[0]?.swapInfo.label || 'jupiter'),
                  from: tokenB,
                  to: tokenA,
                  pool: quote2Result.routePlan[0]?.swapInfo.ammKey || 'unknown',
                  expectedOutput: finalAmount / Math.pow(10, tokenA.decimals),
                },
              ],
              estimatedProfit: estimatedProfitUSD,
              profitPercentage,
              requiredAmount: startAmount / Math.pow(10, tokenA.decimals),
              timestamp: Date.now(),
            });
          } catch (error) {
            console.log(`Error ${tokenA.symbol}->${tokenB.symbol}: ${error}`);
          }
        }

        return results;
      })
    );

    opportunities.push(...batchResults.flat().filter(Boolean));

    if ((i + MAX_CONCURRENT) % 50 === 0) {
      console.log(`Progress: ${scanned}/${pairs.length * amounts.length} scanned, ${found} routes found`);
    }
  }

  console.log(`SCAN COMPLETE: Found ${opportunities.length} total routes from ${scanned} checks`);
  return opportunities;
}

async function getTokenPriceUSD(mint: string): Promise<string> {
  try {
    const prices = await getTokenPrices([mint]);
    return prices[mint]?.price || '1';
  } catch {
    return '1';
  }
}

function mapLabelToDex(label: string): DexType {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('orca')) return 'orca';
  if (lowerLabel.includes('raydium')) return 'raydium';
  if (lowerLabel.includes('meteora')) return 'meteora';
  return 'jupiter';
}

export async function getSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string,
  wrapUnwrapSOL: boolean = true
) {
  try {
    const response = await fetch(`${JUPITER_QUOTE_API}/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: wrapUnwrapSOL,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!response.ok) {
      return null;
    }

    const { swapTransaction } = await response.json();
    return swapTransaction;
  } catch (error) {
    return null;
  }
}

export interface ComboStep {
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: number;
  dex?: string;
}

export interface ComboExecutionPlan {
  quotes: JupiterQuote[];
  estimatedOutput: number;
  totalSteps: number;
  priceImpact: number;
  estimatedGas: number;
}

export async function buildComboExecutionPlan(
  steps: ComboStep[],
  slippageBps: number = 100
): Promise<ComboExecutionPlan | null> {
  try {
    const quotes: JupiterQuote[] = [];
    let currentAmount = steps[0].amountIn;
    let totalPriceImpact = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const inputToken = i === 0 ? step.tokenIn : steps[i - 1].tokenOut;
      const amountInLamports = Math.floor(currentAmount * Math.pow(10, inputToken.decimals));

      const quote = await getJupiterQuote(
        inputToken.mint,
        step.tokenOut.mint,
        amountInLamports,
        slippageBps
      );

      if (!quote) {
        console.error(`Failed to get quote for step ${i + 1}`);
        return null;
      }

      quotes.push(quote);
      currentAmount = parseInt(quote.outAmount) / Math.pow(10, step.tokenOut.decimals);
      totalPriceImpact += Math.abs(parseFloat(quote.priceImpactPct || '0'));
    }

    return {
      quotes,
      estimatedOutput: currentAmount,
      totalSteps: steps.length,
      priceImpact: totalPriceImpact,
      estimatedGas: steps.length * 0.002,
    };
  } catch (error) {
    console.error('Error building combo execution plan:', error);
    return null;
  }
}

export async function executeCombo(
  executionPlan: ComboExecutionPlan,
  userPublicKey: string
): Promise<string[]> {
  const transactions: string[] = [];

  for (const quote of executionPlan.quotes) {
    const tx = await getSwapTransaction(quote, userPublicKey, true);
    if (tx) {
      transactions.push(tx);
    }
  }

  return transactions;
}
