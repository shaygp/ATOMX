// Jupiter Ultra API service - matches backend scanner structure
export interface JupiterUltraOrder {
  mode: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  inUsdValue?: number;
  outUsdValue?: number;
  priceImpact?: number;
  swapUsdValue?: number;
  priceImpactPct: string;
  routePlan: Array<{
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
    bps: number;
  }>;
  feeMint: string;
  feeBps: number;
  signatureFeeLamports: number;
  prioritizationFeeLamports: number;
  rentFeeLamports: number;
  router: string;
  transaction: string | null;
  gasless: boolean;
  requestId: string;
  totalTime: number;
  taker: string | null;
  quoteId?: string;
  maker?: string;
  expireAt?: string;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  errorCode?: number;
  errorMessage?: string;
}

// Jupiter API endpoints - same as backend
const JUPITER_ULTRA_API_URL = 'https://lite-api.jup.ag/ultra/v1';

export class JupiterUltraService {
  /**
   * Get a quote from Jupiter Ultra API - matches backend implementation
   */
  static async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 50
  ): Promise<JupiterUltraOrder> {
    console.log(`[SIMULATION] Getting Jupiter Ultra quote:`);
    console.log(`[SIMULATION] ${inputMint.slice(0, 8)}... -> ${outputMint.slice(0, 8)}...`);
    console.log(`[SIMULATION] Amount: ${amount.toLocaleString()}, Slippage: ${slippageBps} bps`);

    try {
      const url = `${JUPITER_ULTRA_API_URL}/order`;
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        // Don't include taker for quotes - this makes it a quote-only request
      });

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout equivalent
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jupiter Ultra API error: ${response.status} - ${errorText}`);
      }

      const order: JupiterUltraOrder = await response.json();

      console.log(`[SIMULATION] Quote received successfully`);
      console.log(`[SIMULATION] Input: ${parseInt(order.inAmount).toLocaleString()}`);
      console.log(`[SIMULATION] Output: ${parseInt(order.outAmount).toLocaleString()}`);
      console.log(`[SIMULATION] Price Impact: ${order.priceImpactPct}%`);
      console.log(`[SIMULATION] Router: ${order.router}`);
      console.log(`[SIMULATION] DEX Path: ${order.routePlan.map(r => r.swapInfo.label).join(' -> ')}`);

      return order;
    } catch (error: any) {
      console.error(`[SIMULATION] Quote failed: ${error.message}`);
      throw new Error(`Failed to get Jupiter Ultra quote: ${error.message}`);
    }
  }

  /**
   * Validate a route exists between two tokens
   */
  static async validateRoute(
    inputMint: string,
    outputMint: string
  ): Promise<boolean> {
    try {
      const quote = await this.getQuote(inputMint, outputMint, 1000000);
      return quote.routePlan.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get token prices from Jupiter Price API
   */
  static async getPrices(tokenMints: string[]): Promise<Record<string, any>> {
    try {
      console.log(`[SIMULATION] Fetching prices for ${tokenMints.length} tokens`);
      
      const url = 'https://lite-api.jup.ag/price/v3';
      const params = new URLSearchParams({
        ids: tokenMints.join(',')
      });

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Price API error: ${response.status}`);
      }

      const prices = await response.json();
      console.log(`[SIMULATION] Successfully received ${Object.keys(prices).length} token prices`);
      
      // Log individual prices for debugging
      Object.entries(prices).forEach(([mint, data]: [string, any]) => {
        console.log(`[SIMULATION] ${mint.slice(0, 8)}... = $${data.usdPrice.toFixed(6)}`);
      });

      return prices;
    } catch (error: any) {
      console.error(`[SIMULATION] Error fetching prices: ${error.message}`);
      throw new Error(`Failed to get token prices: ${error.message}`);
    }
  }
}