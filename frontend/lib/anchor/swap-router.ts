import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import SwapRouterIDL from '../idl/swap_router.json';

export const SWAP_ROUTER_PROGRAM_ID = new PublicKey(SwapRouterIDL.address);
export const JUPITER_V6_PROGRAM_ID = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');

export type SwapRouterProgram = Program;

export function getSwapRouterProgram(provider: AnchorProvider): SwapRouterProgram {
  return new Program(SwapRouterIDL as any, provider);
}

export function getRouterStatePDA() {
  const [routerStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('router_state')],
    SWAP_ROUTER_PROGRAM_ID
  );
  return routerStatePDA;
}

export async function initializeRouter(
  program: SwapRouterProgram,
  authority: PublicKey,
  feeRateBps: number
) {
  const routerStatePDA = getRouterStatePDA();

  return program.methods
    .initializeRouter(feeRateBps)
    .accounts({
      routerState: routerStatePDA,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function executeJupiterSwap(
  program: SwapRouterProgram,
  user: PublicKey,
  jupiterInstructionData: Buffer,
  remainingAccounts: any[]
) {
  const routerStatePDA = getRouterStatePDA();

  return program.methods
    .executeJupiterSwap(jupiterInstructionData)
    .accounts({
      routerState: routerStatePDA,
      user,
      jupiterProgram: JUPITER_V6_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .rpc();
}
