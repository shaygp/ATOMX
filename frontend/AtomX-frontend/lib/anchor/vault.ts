import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import VaultIDL from '../idl/vault.json';

export const VAULT_PROGRAM_ID = new PublicKey(VaultIDL.address);

export type VaultProgram = Program;

export function getVaultProgram(provider: AnchorProvider): VaultProgram {
  return new Program(VaultIDL as any, provider);
}

export function getVaultPDA() {
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault')],
    VAULT_PROGRAM_ID
  );
  return vaultPDA;
}

export function getUserPositionPDA(userPubkey: PublicKey) {
  const [positionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), userPubkey.toBuffer()],
    VAULT_PROGRAM_ID
  );
  return positionPDA;
}

export async function initializeVault(
  program: VaultProgram,
  authority: PublicKey,
  swapRouter: PublicKey
) {
  const vaultPDA = getVaultPDA();

  return program.methods
    .initializeVault()
    .accounts({
      vault: vaultPDA,
      authority,
      swapRouter,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function deposit(
  program: VaultProgram,
  user: PublicKey,
  userToken: PublicKey,
  vaultToken: PublicKey,
  amount: BN
) {
  const vaultPDA = getVaultPDA();
  const positionPDA = getUserPositionPDA(user);

  return program.methods
    .deposit(amount)
    .accounts({
      vault: vaultPDA,
      userPosition: positionPDA,
      user,
      userToken,
      vaultToken,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function withdraw(
  program: VaultProgram,
  user: PublicKey,
  userToken: PublicKey,
  vaultToken: PublicKey,
  shares: BN
) {
  const vaultPDA = getVaultPDA();
  const positionPDA = getUserPositionPDA(user);

  return program.methods
    .withdraw(shares)
    .accounts({
      vault: vaultPDA,
      userPosition: positionPDA,
      user,
      vaultToken,
      userToken,
      tokenProgram: TOKEN_PROGRAM_ID,
      owner: user,
    })
    .rpc();
}

export async function executeArbitrage(
  program: VaultProgram,
  executor: PublicKey,
  executorToken: PublicKey,
  vaultToken: PublicKey,
  swapRouterProgram: PublicKey,
  routerState: PublicKey,
  jupiterProgram: PublicKey,
  jupiterInstructionData: Buffer,
  minProfit: BN,
  remainingAccounts: any[]
) {
  const vaultPDA = getVaultPDA();

  return program.methods
    .executeArbitrage(jupiterInstructionData, minProfit)
    .accounts({
      vault: vaultPDA,
      vaultToken,
      executor,
      executorToken,
      swapRouterProgram,
      routerState,
      jupiterProgram,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .rpc();
}
