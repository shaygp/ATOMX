import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { getVaultProgram, getVaultPDA } from './anchor/vault';
import { getRouterStatePDA, JUPITER_V6_PROGRAM_ID, SWAP_ROUTER_PROGRAM_ID } from './anchor/swap-router';
import { getJupiterQuote, JupiterQuote } from './jupiter';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';

export async function buildVaultArbitrageTransaction(
  connection: Connection,
  provider: AnchorProvider,
  quote: JupiterQuote,
  vaultTokenMint: PublicKey,
  executorPublicKey: PublicKey,
  minProfitLamports: number
): Promise<Transaction | null> {
  try {
    const vaultPDA = getVaultPDA();

    const jupiterSwapResponse = await fetch(`${JUPITER_QUOTE_API}/swap-instructions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: vaultPDA.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!jupiterSwapResponse.ok) {
      console.error('Jupiter swap instructions failed');
      return null;
    }

    const {
      setupInstructions = [],
      swapInstruction,
      cleanupInstruction,
    } = await jupiterSwapResponse.json();

    if (!swapInstruction) {
      console.error('No swap instruction received from Jupiter');
      return null;
    }

    const deserializeInstruction = (instruction: any): TransactionInstruction => {
      return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((key: any) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(instruction.data, 'base64'),
      });
    };

    const jupiterIx = deserializeInstruction(swapInstruction);

    const program = getVaultProgram(provider);
    const routerStatePDA = getRouterStatePDA();

    const vaultTokenAccount = getAssociatedTokenAddressSync(
      vaultTokenMint,
      vaultPDA,
      true
    );

    const executorTokenAccount = getAssociatedTokenAddressSync(
      vaultTokenMint,
      executorPublicKey,
      true
    );

    const remainingAccounts = jupiterIx.keys.map(key => ({
      pubkey: key.pubkey,
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    }));

    const arbitrageIx = await program.methods
      .executeArbitrage(
        jupiterIx.data,
        new BN(minProfitLamports)
      )
      .accounts({
        vault: vaultPDA,
        vaultToken: vaultTokenAccount,
        executor: executorPublicKey,
        executorToken: executorTokenAccount,
        swapRouterProgram: SWAP_ROUTER_PROGRAM_ID,
        routerState: routerStatePDA,
        jupiterProgram: JUPITER_V6_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    const transaction = new Transaction();

    setupInstructions.forEach((ix: any) => {
      transaction.add(deserializeInstruction(ix));
    });

    transaction.add(arbitrageIx);

    if (cleanupInstruction) {
      transaction.add(deserializeInstruction(cleanupInstruction));
    }

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = executorPublicKey;

    return transaction;
  } catch (error) {
    console.error('Error building vault arbitrage transaction:', error);
    return null;
  }
}

export async function executeVaultArbitrage(
  connection: Connection,
  provider: AnchorProvider,
  inputMint: string,
  outputMint: string,
  amount: number,
  vaultTokenMint: PublicKey,
  executorPublicKey: PublicKey,
  minProfitLamports: number,
  slippageBps: number = 50
): Promise<string | null> {
  try {
    const quote = await getJupiterQuote(inputMint, outputMint, amount, slippageBps);

    if (!quote) {
      console.error('Failed to get Jupiter quote');
      return null;
    }

    const transaction = await buildVaultArbitrageTransaction(
      connection,
      provider,
      quote,
      vaultTokenMint,
      executorPublicKey,
      minProfitLamports
    );

    if (!transaction) {
      console.error('Failed to build transaction');
      return null;
    }

    const signature = await provider.sendAndConfirm(transaction);
    return signature;
  } catch (error) {
    console.error('Error executing vault arbitrage:', error);
    return null;
  }
}

export interface VaultComboStep {
  inputMint: string;
  outputMint: string;
  amount: number;
}

export async function executeVaultCombo(
  connection: Connection,
  provider: AnchorProvider,
  steps: VaultComboStep[],
  vaultTokenMint: PublicKey,
  executorPublicKey: PublicKey,
  minProfitPerStep: number = 0,
  slippageBps: number = 100
): Promise<string[]> {
  const signatures: string[] = [];

  let currentAmount = steps[0].amount;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    const stepAmount = i === 0 ? step.amount : currentAmount;

    try {
      const quote = await getJupiterQuote(
        step.inputMint,
        step.outputMint,
        stepAmount,
        slippageBps
      );

      if (!quote) {
        console.error(`Failed to get quote for step ${i + 1}`);
        break;
      }

      currentAmount = parseInt(quote.outAmount);

      const signature = await executeVaultArbitrage(
        connection,
        provider,
        step.inputMint,
        step.outputMint,
        stepAmount,
        vaultTokenMint,
        executorPublicKey,
        minProfitPerStep,
        slippageBps
      );

      if (signature) {
        signatures.push(signature);
        console.log(`Step ${i + 1} completed: ${signature}`);
      } else {
        console.error(`Step ${i + 1} failed`);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error in step ${i + 1}:`, error);
      break;
    }
  }

  return signatures;
}

export async function executeVaultArbitrageLoop(
  connection: Connection,
  provider: AnchorProvider,
  tokenA: string,
  tokenB: string,
  startAmount: number,
  vaultTokenMint: PublicKey,
  executorPublicKey: PublicKey,
  minProfitLamports: number,
  slippageBps: number = 50
): Promise<{ signatures: string[], finalAmount: number, profit: number } | null> {
  try {
    const quote1 = await getJupiterQuote(tokenA, tokenB, startAmount, slippageBps);
    if (!quote1) {
      console.error('Failed to get first quote');
      return null;
    }

    const midAmount = parseInt(quote1.outAmount);

    const quote2 = await getJupiterQuote(tokenB, tokenA, midAmount, slippageBps);
    if (!quote2) {
      console.error('Failed to get return quote');
      return null;
    }

    const finalAmount = parseInt(quote2.outAmount);
    const profit = finalAmount - startAmount;

    if (profit < minProfitLamports) {
      console.error(`Insufficient profit: ${profit} < ${minProfitLamports}`);
      return null;
    }

    const signatures: string[] = [];

    const sig1 = await executeVaultArbitrage(
      connection,
      provider,
      tokenA,
      tokenB,
      startAmount,
      vaultTokenMint,
      executorPublicKey,
      0,
      slippageBps
    );

    if (!sig1) {
      console.error('First swap failed');
      return null;
    }

    signatures.push(sig1);
    console.log(`First swap completed: ${sig1}`);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const sig2 = await executeVaultArbitrage(
      connection,
      provider,
      tokenB,
      tokenA,
      midAmount,
      vaultTokenMint,
      executorPublicKey,
      minProfitLamports,
      slippageBps
    );

    if (!sig2) {
      console.error('Return swap failed');
      return null;
    }

    signatures.push(sig2);
    console.log(`Return swap completed: ${sig2}`);

    return { signatures, finalAmount, profit };
  } catch (error) {
    console.error('Error executing vault arbitrage loop:', error);
    return null;
  }
}
