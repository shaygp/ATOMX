import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { executeVaultCombo, executeVaultArbitrageLoop, VaultComboStep } from './vault-transactions';
import { COMMON_TOKENS } from './constants';

const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export async function executeComboViaVault(
  connection: Connection,
  provider: AnchorProvider,
  steps: Array<{ tokenInSymbol: string; tokenOutSymbol: string; amountIn: number }>,
  executorPublicKey: PublicKey
) {
  const vaultComboSteps: VaultComboStep[] = steps.map((step, i) => {
    const tokenIn = COMMON_TOKENS.find(t => t.symbol === step.tokenInSymbol);
    const tokenOut = COMMON_TOKENS.find(t => t.symbol === step.tokenOutSymbol);

    if (!tokenIn || !tokenOut) {
      throw new Error(`Token not found: ${step.tokenInSymbol} or ${step.tokenOutSymbol}`);
    }

    const amountInLamports = i === 0
      ? Math.floor(step.amountIn * Math.pow(10, tokenIn.decimals))
      : 0;

    return {
      inputMint: tokenIn.mint,
      outputMint: tokenOut.mint,
      amount: amountInLamports,
    };
  });

  const firstToken = COMMON_TOKENS.find(t => t.symbol === steps[0].tokenInSymbol);
  const vaultTokenMint = new PublicKey(firstToken!.mint);

  const signatures = await executeVaultCombo(
    connection,
    provider,
    vaultComboSteps,
    vaultTokenMint,
    executorPublicKey,
    0,
    100
  );

  return signatures;
}

export async function executeArbitrageViaVault(
  connection: Connection,
  provider: AnchorProvider,
  tokenASymbol: string,
  tokenBSymbol: string,
  startAmount: number,
  executorPublicKey: PublicKey,
  minProfitUSD: number = 0.1
) {
  const tokenA = COMMON_TOKENS.find(t => t.symbol === tokenASymbol);
  const tokenB = COMMON_TOKENS.find(t => t.symbol === tokenBSymbol);

  if (!tokenA || !tokenB) {
    throw new Error(`Token not found: ${tokenASymbol} or ${tokenBSymbol}`);
  }

  const startAmountLamports = Math.floor(startAmount * Math.pow(10, tokenA.decimals));

  const minProfitLamports = Math.floor(minProfitUSD * Math.pow(10, tokenA.decimals) / 100);

  const vaultTokenMint = new PublicKey(tokenA.mint);

  const result = await executeVaultArbitrageLoop(
    connection,
    provider,
    tokenA.mint,
    tokenB.mint,
    startAmountLamports,
    vaultTokenMint,
    executorPublicKey,
    minProfitLamports,
    50
  );

  return result;
}
