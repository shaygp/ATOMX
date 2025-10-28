'use client';

import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import {
  fetchVaultData,
  fetchUserPosition,
  createDepositTransaction,
  createWithdrawTransaction,
  calculateUserValue,
  getVaultTotalValue,
  VaultData,
  UserPositionData,
} from '@/lib/vault';
import { devnetConnection } from '@/lib/solana';
import BN from 'bn.js';

export interface VaultInfo {
  totalValue: number;
  totalShares: BN;
  userShares: BN;
  userValue: number;
  sharePrice: number;
  depositors: number;
}

export const useVault = () => {
  const { connected, publicKey, signTransaction } = useWallet();
  const [vaultInfo, setVaultInfo] = useState<VaultInfo>({
    totalValue: 0,
    totalShares: new BN(0),
    userShares: new BN(0),
    userValue: 0,
    sharePrice: 0,
    depositors: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch vault and user position data
  const fetchVaultInfo = useCallback(async () => {
    if (!connected || !publicKey) {
      setVaultInfo({
        totalValue: 0,
        totalShares: new BN(0),
        userShares: new BN(0),
        userValue: 0,
        sharePrice: 0,
        depositors: 0,
      });
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch vault data and user position in parallel
      const [vaultData, userPosition, totalValue] = await Promise.all([
        fetchVaultData(),
        fetchUserPosition(publicKey),
        getVaultTotalValue(),
      ]);

      if (!vaultData) {
        throw new Error('Vault not found or not initialized');
      }

      const userShares = userPosition?.shares || new BN(0);
      const userValue = vaultData.totalShares.gt(new BN(0))
        ? await calculateUserValue(userShares, vaultData.totalShares)
        : 0;

      const sharePrice = vaultData.totalShares.gt(new BN(0))
        ? totalValue / vaultData.totalShares.toNumber()
        : 1;

      setVaultInfo({
        totalValue,
        totalShares: vaultData.totalShares,
        userShares,
        userValue,
        sharePrice,
        depositors: 0, // Would need to be tracked separately or calculated
      });
    } catch (err: any) {
      console.error('Error fetching vault info:', err);
      setError(err.message || 'Failed to fetch vault information');
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey]);

  // Deposit SOL into vault
  const deposit = useCallback(async (amount: number): Promise<string | null> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    let signature: string | null = null;
    
    try {
      setLoading(true);
      setError(null);

      // Create deposit transaction
      const transaction = await createDepositTransaction(publicKey, amount);
      
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await devnetConnection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Sign transaction
      const signedTransaction = await signTransaction(transaction);

      // Send transaction
      signature = await devnetConnection.sendRawTransaction(signedTransaction.serialize());
      
      // Confirm transaction with better error handling
      try {
        await devnetConnection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        });
      } catch (confirmError: any) {
        // Check if the error is about the transaction already being processed
        const errorMessage = confirmError.message || '';
        const isAlreadyProcessedError = errorMessage.includes('Transaction has already been processed') ||
                                       errorMessage.includes('already been processed');
        
        if (isAlreadyProcessedError) {
          console.log('Transaction already processed (this is normal for successful transactions)');
          // Don't throw error, continue with success flow
        } else {
          // For other confirmation errors, check transaction status
          try {
            const txStatus = await devnetConnection.getSignatureStatus(signature);
            if (txStatus.value?.confirmationStatus === 'confirmed' || 
                txStatus.value?.confirmationStatus === 'finalized') {
              console.log('Transaction confirmed despite confirmation error');
              // Continue with success flow
            } else {
              throw confirmError; // Re-throw if transaction is not confirmed
            }
          } catch (statusError) {
            throw confirmError; // Re-throw original confirmation error
          }
        }
      }

      // Refresh vault info
      await fetchVaultInfo();

      return signature;
    } catch (err: any) {
      console.error('Deposit error:', err);
      
      // Don't show error if we have a signature and the error is about already processed transaction
      const errorMessage = err.message || '';
      const isAlreadyProcessedError = errorMessage.includes('Transaction has already been processed') ||
                                     errorMessage.includes('already been processed');
      
      if (signature && isAlreadyProcessedError) {
        // Transaction was successful, refresh vault info and return signature
        await fetchVaultInfo();
        return signature;
      }
      
      setError(err.message || 'Deposit failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, signTransaction, fetchVaultInfo]);

  // Withdraw SOL from vault
  const withdraw = useCallback(async (shares: BN): Promise<string | null> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    let signature: string | null = null;
    
    try {
      setLoading(true);
      setError(null);

      // Create withdraw transaction
      const transaction = await createWithdrawTransaction(publicKey, shares);
      
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await devnetConnection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Sign transaction
      const signedTransaction = await signTransaction(transaction);

      // Send transaction
      signature = await devnetConnection.sendRawTransaction(signedTransaction.serialize());
      
      // Confirm transaction with better error handling
      try {
        await devnetConnection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        });
      } catch (confirmError: any) {
        // Check if the error is about the transaction already being processed
        const errorMessage = confirmError.message || '';
        const isAlreadyProcessedError = errorMessage.includes('Transaction has already been processed') ||
                                       errorMessage.includes('already been processed');
        
        if (isAlreadyProcessedError) {
          console.log('Transaction already processed (this is normal for successful transactions)');
          // Don't throw error, continue with success flow
        } else {
          // For other confirmation errors, check transaction status
          try {
            const txStatus = await devnetConnection.getSignatureStatus(signature);
            if (txStatus.value?.confirmationStatus === 'confirmed' || 
                txStatus.value?.confirmationStatus === 'finalized') {
              console.log('Transaction confirmed despite confirmation error');
              // Continue with success flow
            } else {
              throw confirmError; // Re-throw if transaction is not confirmed
            }
          } catch (statusError) {
            throw confirmError; // Re-throw original confirmation error
          }
        }
      }

      // Refresh vault info
      await fetchVaultInfo();

      return signature;
    } catch (err: any) {
      console.error('Withdraw error:', err);
      
      // Don't show error if we have a signature and the error is about already processed transaction
      const errorMessage = err.message || '';
      const isAlreadyProcessedError = errorMessage.includes('Transaction has already been processed') ||
                                     errorMessage.includes('already been processed');
      
      if (signature && isAlreadyProcessedError) {
        // Transaction was successful, refresh vault info and return signature
        await fetchVaultInfo();
        return signature;
      }
      
      setError(err.message || 'Withdraw failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, signTransaction, fetchVaultInfo]);

  // Fetch vault info on mount and when wallet changes
  useEffect(() => {
    fetchVaultInfo();
  }, [fetchVaultInfo]);

  // Set up periodic refresh every 10 seconds
  useEffect(() => {
    if (connected) {
      const interval = setInterval(fetchVaultInfo, 10000);
      return () => clearInterval(interval);
    }
  }, [connected, fetchVaultInfo]);

  return {
    vaultInfo,
    loading,
    error,
    deposit,
    withdraw,
    refresh: fetchVaultInfo,
  };
};