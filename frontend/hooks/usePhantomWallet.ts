'use client';

import { useState, useEffect, useCallback } from 'react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { devnetConnection } from '@/lib/solana';

// Phantom wallet provider interface
interface PhantomProvider {
  isPhantom: boolean;
  publicKey: PublicKey | null;
  isConnected: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: any) => Promise<any>;
  signAllTransactions: (transactions: any[]) => Promise<any[]>;
  signMessage: (message: Uint8Array | string, display?: string) => Promise<{ signature: Uint8Array; publicKey: PublicKey }>;
  request: (method: string, params?: any) => Promise<any>;
  on: (event: string, handler: (args: any) => void) => void;
  removeListener: (event: string, handler: (args: any) => void) => void;
}

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomProvider;
    };
    solana?: PhantomProvider;
  }
}

export const usePhantomWallet = () => {
  const [provider, setProvider] = useState<PhantomProvider | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Detect Phantom provider
  const getProvider = useCallback((): PhantomProvider | null => {
    if (typeof window !== 'undefined') {
      // Check for Phantom wallet
      if (window.phantom?.solana?.isPhantom) {
        return window.phantom.solana;
      }
      // Fallback to window.solana if it's Phantom
      if (window.solana?.isPhantom) {
        return window.solana;
      }
    }
    return null;
  }, []);

  // Fetch wallet balance
  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connected) {
      setBalance(null);
      return;
    }

    try {
      setLoadingBalance(true);
      const balanceInLamports = await devnetConnection.getBalance(publicKey);
      const balanceInSOL = balanceInLamports / LAMPORTS_PER_SOL;
      setBalance(balanceInSOL);
    } catch (err: any) {
      console.error('Error fetching balance:', err);
      setBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, [publicKey, connected]);

  // Initialize provider and check existing connection
  useEffect(() => {
    const phantomProvider = getProvider();
    
    if (phantomProvider) {
      setProvider(phantomProvider);
      
      // Check if already connected
      if (phantomProvider.isConnected && phantomProvider.publicKey) {
        setPublicKey(phantomProvider.publicKey);
        setConnected(true);
      }

      // Listen for account changes
      const handleConnect = (publicKey: PublicKey) => {
        setPublicKey(publicKey);
        setConnected(true);
        setError(null);
      };

      const handleDisconnect = () => {
        setPublicKey(null);
        setConnected(false);
        setError(null);
        setBalance(null);
      };

      const handleAccountChanged = (publicKey: PublicKey | null) => {
        if (publicKey) {
          setPublicKey(publicKey);
          setConnected(true);
        } else {
          setPublicKey(null);
          setConnected(false);
          setBalance(null);
        }
      };

      // Add event listeners
      phantomProvider.on('connect', handleConnect);
      phantomProvider.on('disconnect', handleDisconnect);
      phantomProvider.on('accountChanged', handleAccountChanged);

      // Try to eagerly connect
      phantomProvider.connect({ onlyIfTrusted: true }).catch(() => {
        // Silently fail if not previously authorized
      });

      // Cleanup function
      return () => {
        phantomProvider.removeListener('connect', handleConnect);
        phantomProvider.removeListener('disconnect', handleDisconnect);
        phantomProvider.removeListener('accountChanged', handleAccountChanged);
      };
    } else {
      setError('Phantom wallet not detected. Please install Phantom wallet.');
    }
  }, [getProvider]);

  // Fetch balance when connected and set up periodic refresh
  useEffect(() => {
    if (connected && publicKey) {
      // Fetch balance immediately
      fetchBalance();
      
      // Set up periodic balance refresh every 10 seconds
      const balanceInterval = setInterval(fetchBalance, 10000);
      
      return () => clearInterval(balanceInterval);
    }
  }, [connected, publicKey, fetchBalance]);

  // Connect wallet function
  const connect = useCallback(async () => {
    if (!provider) {
      setError('Phantom wallet not detected. Please install Phantom wallet.');
      return;
    }

    try {
      setConnecting(true);
      setError(null);
      
      const response = await provider.connect();
      setPublicKey(response.publicKey);
      setConnected(true);
      
      // Switch to devnet (note: this method might not be supported by all wallets)
      try {
        await provider.request('wallet_switchEthereumChain', { chainId: 'devnet' });
      } catch (switchError) {
        // Ignore switch errors for now, as the method might not be supported
        console.warn('Could not switch to devnet:', switchError);
      }
      
      // Fetch balance after connecting
      setTimeout(() => fetchBalance(), 100);
      
    } catch (err: any) {
      if (err.code === 4001) {
        setError('Connection request was rejected by user.');
      } else {
        setError(`Failed to connect: ${err.message || 'Unknown error'}`);
      }
      console.error('Connection error:', err);
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  // Disconnect wallet function
  const disconnect = useCallback(async () => {
    if (!provider) return;

    try {
      await provider.disconnect();
      setPublicKey(null);
      setConnected(false);
      setError(null);
      setBalance(null);
    } catch (err: any) {
      setError(`Failed to disconnect: ${err.message || 'Unknown error'}`);
      console.error('Disconnect error:', err);
    }
  }, [provider]);

  // Sign transaction function
  const signTransaction = useCallback(async (transaction: any) => {
    if (!provider || !connected) {
      throw new Error('Wallet not connected');
    }

    try {
      const signedTransaction = await provider.signTransaction(transaction);
      return signedTransaction;
    } catch (err: any) {
      setError(`Failed to sign transaction: ${err.message || 'Unknown error'}`);
      throw err;
    }
  }, [provider, connected]);

  // Sign message function
  const signMessage = useCallback(async (message: string) => {
    if (!provider || !connected) {
      throw new Error('Wallet not connected');
    }

    try {
      const encodedMessage = new TextEncoder().encode(message);
      const signedMessage = await provider.signMessage(encodedMessage, 'utf8');
      return signedMessage;
    } catch (err: any) {
      setError(`Failed to sign message: ${err.message || 'Unknown error'}`);
      throw err;
    }
  }, [provider, connected]);

  return {
    provider,
    publicKey,
    connected,
    connecting,
    error,
    balance,
    loadingBalance,
    connect,
    disconnect,
    signTransaction,
    signMessage,
    fetchBalance,
    isPhantomInstalled: !!provider,
  };
};