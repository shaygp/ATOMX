import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { devnetConnection } from './solana';
import { VAULT_PROGRAM_ID, getVaultPDA } from './vault';
import BN from 'bn.js';

// Router program ID from router.rs
export const ROUTER_PROGRAM_ID = new PublicKey('AgcU7r6U5uPEfFccmhYdMLcjckADdfoJ8QcHCgkG74Zg');

// Jupiter V6 program ID
export const JUPITER_V6_PROGRAM_ID = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');

// Router state PDA
export const getRouterStatePDA = () => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('router_state')],
    ROUTER_PROGRAM_ID
  );
};

// Instruction discriminators for router functions
const EXECUTE_JUPITER_SWAP_DISCRIMINATOR = Buffer.from([164, 35, 198, 137, 82, 225, 242, 182]);
const EXECUTE_VAULT_JUPITER_SWAP_DISCRIMINATOR = Buffer.from([183, 18, 70, 156, 148, 109, 161, 34]);

// Vault instruction discriminator for execute_arbitrage
const EXECUTE_ARBITRAGE_DISCRIMINATOR = Buffer.from([67, 35, 198, 137, 82, 225, 242, 182]);

export interface SwapParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: any;
  priceImpactPct: string;
  routePlan: any[];
}

export interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

// Get Jupiter quote
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 50
): Promise<JupiterQuoteResponse | null> {
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
    });

    const response = await fetch(`https://quote-api.jup.ag/v6/quote?${params}`);
    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting Jupiter quote:', error);
    return null;
  }
}

// Get Jupiter swap transaction
export async function getJupiterSwapTransaction(
  quote: JupiterQuoteResponse,
  userPublicKey: PublicKey,
  wrapUnwrapSOL: boolean = true
): Promise<JupiterSwapResponse | null> {
  try {
    const response = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: wrapUnwrapSOL,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!response.ok) {
      throw new Error(`Jupiter swap API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting Jupiter swap transaction:', error);
    return null;
  }
}

// Execute combo swaps via router
export async function createComboSwapTransaction(
  userPublicKey: PublicKey,
  swaps: SwapParams[]
): Promise<Transaction> {
  const transaction = new Transaction();

  for (const swap of swaps) {
    const inputMint = new PublicKey(swap.inputMint);
    const outputMint = new PublicKey(swap.outputMint);

    // For devnet testing, create mock Jupiter instruction data
    // In production, this would come from actual Jupiter API
    console.log(`Creating mock swap for ${swap.inputMint} -> ${swap.outputMint}`);
    
    // Create minimal mock Jupiter instruction data for testing
    const mockJupiterInstruction = {
      data: Buffer.from([1, 2, 3, 4, 5]), // Mock instruction data
      keys: [
        // Mock account metas - in real implementation these come from Jupiter
        { pubkey: userPublicKey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(swap.inputMint), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(swap.outputMint), isSigner: false, isWritable: false },
      ]
    };

    // Use mock instruction for devnet testing
    const jupiterInstruction = mockJupiterInstruction;

    // Get router state PDA
    const [routerStatePDA] = getRouterStatePDA();

    // Create router instruction to execute Jupiter swap
    const routerInstruction = new TransactionInstruction({
      programId: ROUTER_PROGRAM_ID,
      keys: [
        { pubkey: routerStatePDA, isSigner: false, isWritable: true },
        { pubkey: userPublicKey, isSigner: true, isWritable: true },
        { pubkey: JUPITER_V6_PROGRAM_ID, isSigner: false, isWritable: false },
        ...jupiterInstruction.keys, // All Jupiter accounts
      ],
      data: Buffer.concat([
        EXECUTE_JUPITER_SWAP_DISCRIMINATOR,
        Buffer.from([jupiterInstruction.data.length]), // Data length
        jupiterInstruction.data, // Jupiter instruction data
      ]),
    });

    transaction.add(routerInstruction);
  }

  return transaction;
}

// Execute arbitrage via vault
export async function createArbitrageExecutionTransaction(
  executorPublicKey: PublicKey,
  jupiterInstructionData: Buffer,
  minProfit: number
): Promise<Transaction> {
  const transaction = new Transaction();

  // Get PDAs
  const [vaultPDA] = getVaultPDA();
  const [routerStatePDA] = getRouterStatePDA();

  // Get vault token account (WSOL)
  const vaultTokenAccount = await getAssociatedTokenAddress(
    new PublicKey('So11111111111111111111111111111111111111112'), // WSOL mint
    vaultPDA,
    true
  );

  // Get executor token account
  const executorTokenAccount = await getAssociatedTokenAddress(
    new PublicKey('So11111111111111111111111111111111111111112'), // WSOL mint
    executorPublicKey
  );

  // Check if executor WSOL account exists, create if needed
  const executorTokenAccountInfo = await devnetConnection.getAccountInfo(executorTokenAccount);
  if (!executorTokenAccountInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        executorPublicKey,
        executorTokenAccount,
        executorPublicKey,
        new PublicKey('So11111111111111111111111111111111111111112')
      )
    );
  }

  // Create vault arbitrage execution instruction
  const arbitrageInstruction = new TransactionInstruction({
    programId: VAULT_PROGRAM_ID,
    keys: [
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: executorPublicKey, isSigner: true, isWritable: true },
      { pubkey: executorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: ROUTER_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      EXECUTE_ARBITRAGE_DISCRIMINATOR, // execute_arbitrage discriminator
      Uint8Array.from(new BN(jupiterInstructionData.length).toArray('le', 4)), // Data length as u32
      jupiterInstructionData, // Jupiter instruction data
      Uint8Array.from(new BN(Math.floor(minProfit * 1e9)).toArray('le', 8)), // Min profit in lamports as u64
    ]),
  });

  transaction.add(arbitrageInstruction);

  return transaction;
}

// Execute combo swaps
export async function executeComboSwaps(
  userPublicKey: PublicKey,
  swaps: SwapParams[],
  signTransaction: (transaction: Transaction) => Promise<Transaction>
): Promise<string> {
  try {
    if (swaps.length === 0) {
      throw new Error('No swaps provided');
    }

    console.log('Creating combo swap transaction with params:', swaps);
    
    // Create combo swap transaction
    const transaction = await createComboSwapTransaction(userPublicKey, swaps);
    
    console.log('Transaction created, getting blockhash...');
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await devnetConnection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;

    console.log('Signing transaction...');
    
    // Sign transaction
    const signedTransaction = await signTransaction(transaction);

    console.log('Sending transaction...');
    
    // Send transaction
    const signature = await devnetConnection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    console.log('Transaction sent, confirming...', signature);
    
    // Confirm transaction
    await devnetConnection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    console.log('Transaction confirmed:', signature);
    return signature;
  } catch (error) {
    console.error('Error executing combo swaps:', error);
    throw error;
  }
}

// Execute arbitrage
export async function executeArbitrage(
  executorPublicKey: PublicKey,
  jupiterInstructionData: Buffer,
  minProfit: number,
  signTransaction: (transaction: Transaction) => Promise<Transaction>
): Promise<string> {
  try {
    console.log('Creating arbitrage execution transaction...');
    console.log('Executor:', executorPublicKey.toString());
    console.log('Min profit:', minProfit, 'SOL');
    
    // Create arbitrage execution transaction
    const transaction = await createArbitrageExecutionTransaction(
      executorPublicKey,
      jupiterInstructionData,
      minProfit
    );
    
    console.log('Transaction created, getting blockhash...');
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await devnetConnection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = executorPublicKey;

    console.log('Signing transaction...');
    
    // Sign transaction
    const signedTransaction = await signTransaction(transaction);

    console.log('Sending arbitrage transaction...');
    
    // Send transaction
    const signature = await devnetConnection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    console.log('Arbitrage transaction sent, confirming...', signature);
    
    // Confirm transaction
    await devnetConnection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    console.log('Arbitrage transaction confirmed:', signature);
    return signature;
  } catch (error) {
    console.error('Error executing arbitrage:', error);
    throw error;
  }
}