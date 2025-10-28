import { Connection, PublicKey, Transaction, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { getSwapRouterProgram, getRouterStatePDA, JUPITER_V6_PROGRAM_ID } from './anchor/swap-router';
import { getJupiterQuote, JupiterQuote } from './jupiter';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';

export async function buildRouterSwapTransaction(
  connection: Connection,
  provider: AnchorProvider,
  quote: JupiterQuote,
  userPublicKey: PublicKey
): Promise<Transaction | null> {
  try {
    const jupiterSwapResponse = await fetch(`${JUPITER_QUOTE_API}/swap-instructions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userPublicKey.toBase58(),
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
      addressLookupTableAddresses = []
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

    const program = getSwapRouterProgram(provider);
    const routerStatePDA = getRouterStatePDA();

    const remainingAccounts = jupiterIx.keys.map(key => ({
      pubkey: key.pubkey,
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    }));

    const routerSwapIx = await program.methods
      .executeJupiterSwap(jupiterIx.data)
      .accounts({
        routerState: routerStatePDA,
        user: userPublicKey,
        jupiterProgram: JUPITER_V6_PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    const transaction = new Transaction();

    setupInstructions.forEach((ix: any) => {
      transaction.add(deserializeInstruction(ix));
    });

    transaction.add(routerSwapIx);

    if (cleanupInstruction) {
      transaction.add(deserializeInstruction(cleanupInstruction));
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;

    return transaction;
  } catch (error) {
    console.error('Error building router swap transaction:', error);
    return null;
  }
}

export async function executeRouterSwap(
  connection: Connection,
  provider: AnchorProvider,
  inputMint: string,
  outputMint: string,
  amount: number,
  userPublicKey: PublicKey,
  slippageBps: number = 100
): Promise<string | null> {
  try {
    const quote = await getJupiterQuote(inputMint, outputMint, amount, slippageBps);

    if (!quote) {
      console.error('Failed to get Jupiter quote');
      return null;
    }

    const transaction = await buildRouterSwapTransaction(
      connection,
      provider,
      quote,
      userPublicKey
    );

    if (!transaction) {
      console.error('Failed to build transaction');
      return null;
    }

    const signature = await provider.sendAndConfirm(transaction);
    return signature;
  } catch (error) {
    console.error('Error executing router swap:', error);
    return null;
  }
}

export interface ComboSwapStep {
  inputMint: string;
  outputMint: string;
  amount: number;
}

export async function executeComboSwap(
  connection: Connection,
  provider: AnchorProvider,
  steps: ComboSwapStep[],
  userPublicKey: PublicKey,
  slippageBps: number = 100
): Promise<string[]> {
  const signatures: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    try {
      const signature = await executeRouterSwap(
        connection,
        provider,
        step.inputMint,
        step.outputMint,
        step.amount,
        userPublicKey,
        slippageBps
      );

      if (signature) {
        signatures.push(signature);
        console.log(`Step ${i + 1} completed: ${signature}`);
      } else {
        console.error(`Step ${i + 1} failed`);
        break;
      }
    } catch (error) {
      console.error(`Error in step ${i + 1}:`, error);
      break;
    }
  }

  return signatures;
}
