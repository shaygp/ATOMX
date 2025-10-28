import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';

export function getProvider(wallet: any, endpoint: string = 'https://api.devnet.solana.com') {
  const connection = new Connection(endpoint, 'confirmed');
  return new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
}
