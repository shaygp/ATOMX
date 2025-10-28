'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { PublicKey } from '@solana/web3.js';

interface WalletContextType {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  balance: number | null;
  loadingBalance: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: any) => Promise<any>;
  signMessage: (message: string) => Promise<any>;
  fetchBalance: () => Promise<void>;
  isPhantomInstalled: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const walletState = usePhantomWallet();

  return (
    <WalletContext.Provider value={walletState}>
      {children}
    </WalletContext.Provider>
  );
};