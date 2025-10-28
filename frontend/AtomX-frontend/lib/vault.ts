import {
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  NATIVE_MINT,
} from '@solana/spl-token';
import { devnetConnection } from './solana';
import BN from 'bn.js';

// Vault program ID from the contract
export const VAULT_PROGRAM_ID = new PublicKey('2ea7vwH3ziuFKC2DBwp81MjQpkTTbf4nhNefedcKREDy');

// WSOL mint address (Wrapped SOL)
export const WSOL_MINT = NATIVE_MINT;

// PDA derivation functions
export const getVaultPDA = () => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault')],
    VAULT_PROGRAM_ID
  );
};

export const getUserPositionPDA = (userPublicKey: PublicKey) => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), userPublicKey.toBuffer()],
    VAULT_PROGRAM_ID
  );
};

// Instruction discriminators (8 bytes) - computed from method names
const DEPOSIT_DISCRIMINATOR = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]);
const WITHDRAW_DISCRIMINATOR = Buffer.from([183, 18, 70, 156, 148, 109, 161, 34]);

// Vault and UserPosition account structures
export interface VaultData {
  authority: PublicKey;
  swapRouter: PublicKey;
  totalShares: BN;
  bump: number;
}

export interface UserPositionData {
  owner: PublicKey;
  shares: BN;
}

// Fetch vault data
export async function fetchVaultData(): Promise<VaultData | null> {
  try {
    const [vaultPDA] = getVaultPDA();
    const accountInfo = await devnetConnection.getAccountInfo(vaultPDA);
    
    if (!accountInfo) return null;
    
    // Parse the account data (simplified - in production use proper borsh deserialization)
    const data = accountInfo.data;
    
    // Skip discriminator (8 bytes) and parse fields
    let offset = 8;
    const authority = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const swapRouter = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const totalShares = new BN(data.subarray(offset, offset + 8), 'le');
    offset += 8;
    const bump = data[offset];
    
    return {
      authority,
      swapRouter,
      totalShares,
      bump,
    };
  } catch (error) {
    console.error('Error fetching vault data:', error);
    return null;
  }
}

// Fetch user position data
export async function fetchUserPosition(userPublicKey: PublicKey): Promise<UserPositionData | null> {
  try {
    const [userPositionPDA] = getUserPositionPDA(userPublicKey);
    const accountInfo = await devnetConnection.getAccountInfo(userPositionPDA);
    
    if (!accountInfo) return null;
    
    // Parse the account data
    const data = accountInfo.data;
    
    // Skip discriminator (8 bytes) and parse fields
    let offset = 8;
    const owner = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;
    const shares = new BN(data.subarray(offset, offset + 8), 'le');
    
    return {
      owner,
      shares,
    };
  } catch (error) {
    console.error('Error fetching user position:', error);
    return null;
  }
}

// Get vault token account (WSOL account owned by vault)
export async function getVaultTokenAccount(): Promise<PublicKey> {
  const [vaultPDA] = getVaultPDA();
  return getAssociatedTokenAddress(WSOL_MINT, vaultPDA, true);
}

// Create deposit transaction
export async function createDepositTransaction(
  userPublicKey: PublicKey,
  amount: number // Amount in SOL
): Promise<Transaction> {
  const transaction = new Transaction();
  const lamports = Math.floor(amount * 1e9); // Convert SOL to lamports
  
  // Get PDAs
  const [vaultPDA] = getVaultPDA();
  const [userPositionPDA] = getUserPositionPDA(userPublicKey);
  
  // Get token accounts
  const userTokenAccount = await getAssociatedTokenAddress(WSOL_MINT, userPublicKey);
  const vaultTokenAccount = await getVaultTokenAccount();
  
  // Check if user WSOL account exists, create if needed
  const userTokenAccountInfo = await devnetConnection.getAccountInfo(userTokenAccount);
  if (!userTokenAccountInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        userPublicKey,
        userTokenAccount,
        userPublicKey,
        WSOL_MINT
      )
    );
  }
  
  // Check if vault WSOL account exists, create if needed
  const vaultTokenAccountInfo = await devnetConnection.getAccountInfo(vaultTokenAccount);
  if (!vaultTokenAccountInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        userPublicKey, // payer
        vaultTokenAccount,
        vaultPDA, // owner
        WSOL_MINT
      )
    );
  }
  
  // Add SOL to WSOL account (wrap SOL)
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: userPublicKey,
      toPubkey: userTokenAccount,
      lamports,
    })
  );
  
  // Sync native (convert SOL to WSOL)
  transaction.add(createSyncNativeInstruction(userTokenAccount));
  
  // Create deposit instruction
  const depositInstruction = new TransactionInstruction({
    programId: VAULT_PROGRAM_ID,
    keys: [
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: userPositionPDA, isSigner: false, isWritable: true },
      { pubkey: userPublicKey, isSigner: true, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      DEPOSIT_DISCRIMINATOR,
      Buffer.from(new BN(lamports).toArray('le', 8)),
    ]),
  });
  
  transaction.add(depositInstruction);
  
  // Close WSOL account to get remaining SOL back
  transaction.add(
    createCloseAccountInstruction(
      userTokenAccount,
      userPublicKey,
      userPublicKey
    )
  );
  
  return transaction;
}

// Create withdraw transaction
export async function createWithdrawTransaction(
  userPublicKey: PublicKey,
  shares: BN
): Promise<Transaction> {
  const transaction = new Transaction();
  
  // Get PDAs
  const [vaultPDA] = getVaultPDA();
  const [userPositionPDA] = getUserPositionPDA(userPublicKey);
  
  // Get token accounts
  const userTokenAccount = await getAssociatedTokenAddress(WSOL_MINT, userPublicKey);
  const vaultTokenAccount = await getVaultTokenAccount();
  
  // Check if user WSOL account exists, create if needed
  const userTokenAccountInfo = await devnetConnection.getAccountInfo(userTokenAccount);
  if (!userTokenAccountInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        userPublicKey,
        userTokenAccount,
        userPublicKey,
        WSOL_MINT
      )
    );
  }
  
  // Create withdraw instruction
  const withdrawInstruction = new TransactionInstruction({
    programId: VAULT_PROGRAM_ID,
    keys: [
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: userPositionPDA, isSigner: false, isWritable: true },
      { pubkey: userPublicKey, isSigner: true, isWritable: true },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: userPublicKey, isSigner: false, isWritable: false }, // owner
    ],
    data: Buffer.concat([
      WITHDRAW_DISCRIMINATOR,
      Buffer.from(shares.toArray('le', 8)),
    ]),
  });
  
  transaction.add(withdrawInstruction);
  
  // Close WSOL account to convert back to SOL
  transaction.add(
    createCloseAccountInstruction(
      userTokenAccount,
      userPublicKey,
      userPublicKey
    )
  );
  
  return transaction;
}

// Calculate user position value in SOL
export async function calculateUserValue(userShares: BN, totalShares: BN): Promise<number> {
  try {
    const vaultTokenAccount = await getVaultTokenAccount();
    const tokenAccountInfo = await devnetConnection.getAccountInfo(vaultTokenAccount);
    
    if (!tokenAccountInfo || totalShares.isZero()) {
      return 0;
    }
    
    // Parse token account data to get balance
    const balance = new BN(tokenAccountInfo.data.subarray(64, 72), 'le'); // Amount is at offset 64
    
    // Calculate user's share of the vault
    const userValue = userShares.mul(balance).div(totalShares);
    
    return userValue.toNumber() / 1e9; // Convert lamports to SOL
  } catch (error) {
    console.error('Error calculating user value:', error);
    return 0;
  }
}

// Get vault total value in SOL
export async function getVaultTotalValue(): Promise<number> {
  try {
    const vaultTokenAccount = await getVaultTokenAccount();
    const tokenAccountInfo = await devnetConnection.getAccountInfo(vaultTokenAccount);
    
    if (!tokenAccountInfo) {
      return 0;
    }
    
    // Parse token account data to get balance
    const balance = new BN(tokenAccountInfo.data.subarray(64, 72), 'le');
    
    return balance.toNumber() / 1e9; // Convert lamports to SOL
  } catch (error) {
    console.error('Error getting vault total value:', error);
    return 0;
  }
}