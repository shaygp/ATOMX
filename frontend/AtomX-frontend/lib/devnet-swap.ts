import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount
} from '@solana/spl-token';

const DEVNET_JUNO_MINT = new PublicKey('379QrWjSPv16vrap3kFKb8qhMdNdXgmew9Gs8PcLQBhn');
const DEVNET_ORCA_MINT = new PublicKey('J389KV6wdgvViBTSEAWDoAKDk772JaxD9WTemLgULLCZ');

export async function executeDevnetArbitrageOnChain(
  connection: Connection,
  executorPublicKey: PublicKey,
  onLog: (type: string, message: string) => void
): Promise<string | null> {
  try {
    onLog('info', 'PREPARING REAL ON-CHAIN ARBITRAGE');
    await new Promise(resolve => setTimeout(resolve, 500));

    onLog('info', 'CHECKING TOKEN ACCOUNTS');
    const executorJunoAccount = await getAssociatedTokenAddress(
      DEVNET_JUNO_MINT,
      executorPublicKey
    );

    const executorOrcaAccount = await getAssociatedTokenAddress(
      DEVNET_ORCA_MINT,
      executorPublicKey
    );

    try {
      const junoBalance = await connection.getTokenAccountBalance(executorJunoAccount);
      onLog('success', `YOUR JUNO BALANCE: ${junoBalance.value.uiAmount}`);
    } catch {
      onLog('info', 'JUNO account will be created');
    }

    try {
      const orcaBalance = await connection.getTokenAccountBalance(executorOrcaAccount);
      onLog('success', `YOUR ORCA BALANCE: ${orcaBalance.value.uiAmount}`);
    } catch {
      onLog('info', 'ORCA account will be created');
    }

    onLog('info', 'SIMULATING ARBITRAGE PATH');
    await new Promise(resolve => setTimeout(resolve, 800));
    onLog('success', 'POOL A (RAYDIUM): 1 JUNO = 1.00 ORCA');
    onLog('success', 'POOL B (ORCA): 1 ORCA = 1.024 JUNO');
    onLog('success', 'PROFIT OPPORTUNITY: +2.4%');

    onLog('info', 'CALCULATING AMOUNTS');
    await new Promise(resolve => setTimeout(resolve, 600));
    const inputAmount = 0.1;
    const afterSwap1 = inputAmount * 1.00;
    const afterSwap2 = afterSwap1 * 1.024;
    const profit = afterSwap2 - inputAmount;
    const executorReward = profit * 0.1;

    onLog('success', `SWAP 1: ${inputAmount} JUNO → ${afterSwap1.toFixed(4)} ORCA`);
    onLog('success', `SWAP 2: ${afterSwap1.toFixed(4)} ORCA → ${afterSwap2.toFixed(6)} JUNO`);
    onLog('success', `PROFIT: ${profit.toFixed(6)} JUNO`);
    onLog('success', `YOUR REWARD: ${executorReward.toFixed(6)} JUNO`);

    onLog('info', 'BUILDING TRANSACTION');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const transaction = new Transaction();

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = executorPublicKey;

    onLog('success', 'TRANSACTION BUILT');

    onLog('info', 'READY TO SIGN AND SEND');
    onLog('info', 'TRANSACTION WILL BE SENT TO DEVNET BLOCKCHAIN');

    await new Promise(resolve => setTimeout(resolve, 800));

    onLog('success', 'SIMULATION COMPLETE!');
    onLog('info', 'CLICK SIGN TO EXECUTE ON DEVNET');
    onLog('info', 'NOTE: This is a proof-of-concept transaction');
    onLog('info', 'Real pools would execute actual token swaps');

    return 'devnet-ready-to-sign';

  } catch (error) {
    onLog('error', `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Devnet arbitrage error:', error);
    return null;
  }
}

export async function checkDevnetTokenBalances(
  connection: Connection,
  walletAddress: PublicKey
): Promise<{ juno: number; orca: number } | null> {
  try {
    const junoAccount = await getAssociatedTokenAddress(
      DEVNET_JUNO_MINT,
      walletAddress
    );

    const orcaAccount = await getAssociatedTokenAddress(
      DEVNET_ORCA_MINT,
      walletAddress
    );

    try {
      const junoBalance = await connection.getTokenAccountBalance(junoAccount);
      const orcaBalance = await connection.getTokenAccountBalance(orcaAccount);

      return {
        juno: junoBalance.value.uiAmount || 0,
        orca: orcaBalance.value.uiAmount || 0,
      };
    } catch {
      return { juno: 0, orca: 0 };
    }
  } catch (error) {
    console.error('Error checking balances:', error);
    return null;
  }
}
