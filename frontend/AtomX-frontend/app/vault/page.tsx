'use client';

import { useState, useEffect, useRef } from 'react';
import { formatNumber } from '@/lib/utils';
import { useWallet } from '@/contexts/WalletContext';
import { useVault } from '@/hooks/useVault';
import BN from 'bn.js';

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'deposit' | 'withdraw';
  message: string;
}

interface Transaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: string;
  shares: string;
  timestamp: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
}

export default function VaultPage() {
  const { connected, publicKey, balance } = useWallet();
  const { vaultInfo, loading: vaultLoading, error: vaultError, deposit, withdraw } = useVault();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawShares, setWithdrawShares] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [bootComplete, setBootComplete] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vaultLatency, setVaultLatency] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (type: LogEntry['type'], message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-50), { timestamp, type, message }]);
  };

  useEffect(() => {
    const bootSequence = async () => {
      const messages = [
        'INITIALIZING ATOMX VAULT TERMINAL v1.0.0',
        'LOADING SOLANA DEVNET CONNECTION',
        'CONNECTING TO VAULT PROGRAM',
        'INITIALIZING SHARE CALCULATION ENGINE',
        'LOADING DEPOSIT/WITHDRAW HANDLERS',
        'ESTABLISHING RPC WEBSOCKET',
        'CALIBRATING VAULT METRICS',
        'SYSTEM READY - VAULT TERMINAL ONLINE'
      ];

      for (let i = 0; i < messages.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 150));
        addLog('info', messages[i]);
      }
      setBootComplete(true);
      addLog('success', 'VAULT SYSTEM OPERATIONAL - READY FOR TRANSACTIONS');
      
      if (connected) {
        addLog('info', 'FETCHING VAULT POSITION DATA...');
      }
    };

    bootSequence();
  }, [connected]);

  // Log vault errors
  useEffect(() => {
    if (vaultError) {
      addLog('error', `VAULT ERROR: ${vaultError}`);
    }
  }, [vaultError]);

  useEffect(() => {
    const measureLatency = async () => {
      const start = performance.now();
      try {
        await fetch('https://api.mainnet-beta.solana.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getHealth'
          })
        });
        const latency = Math.round(performance.now() - start);
        setVaultLatency(latency);
      } catch {
        setVaultLatency(999);
      }
    };

    measureLatency();
    const interval = setInterval(measureLatency, 10000);
    return () => clearInterval(interval);
  }, []);

  // Removed auto-scroll for logs

  const handleDeposit = async () => {
    if (!connected) {
      addLog('error', 'WALLET NOT CONNECTED - DEPOSIT ABORTED');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (!depositAmount || amount <= 0 || isNaN(amount)) {
      addLog('error', 'INVALID DEPOSIT AMOUNT - TRANSACTION CANCELLED');
      return;
    }

    // Check if user has enough balance (reserve for transaction fees)
    const availableBalance = balance || 0;
    const reservedForFees = 0.01;
    const maxDepositable = Math.max(0, availableBalance - reservedForFees);
    
    if (amount > maxDepositable) {
      addLog('error', `INSUFFICIENT BALANCE - MAX: ${maxDepositable.toFixed(4)} SOL (${reservedForFees} SOL RESERVED FOR FEES)`);
      return;
    }

    setIsDepositing(true);
    addLog('deposit', `INITIATING DEPOSIT: ${amount} SOL`);

    try {
      addLog('info', 'BUILDING VAULT DEPOSIT TRANSACTION');
      
      const signature = await deposit(amount);
      
      if (signature) {
        addLog('success', `DEPOSIT SUCCESSFUL: ${signature.substring(0, 12)}...`);
        
        const txId = `TX${Date.now().toString(36).toUpperCase()}`;
        setTransactions(prev => [{
          id: txId,
          type: 'DEPOSIT',
          amount: `${amount} SOL`,
          shares: vaultInfo.userShares.toString(),
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          status: 'CONFIRMED'
        }, ...prev.slice(0, 9)]);
        
        setDepositAmount('');
        addLog('info', 'VAULT POSITION UPDATED - SHARES ALLOCATED');
      }
    } catch (error) {
      addLog('error', `DEPOSIT FAILED: ${error instanceof Error ? error.message : 'UNKNOWN'}`);
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!connected) {
      addLog('error', 'WALLET NOT CONNECTED - WITHDRAW ABORTED');
      return;
    }

    const shares = parseFloat(withdrawShares);
    if (!withdrawShares || shares <= 0 || isNaN(shares)) {
      addLog('error', 'INVALID SHARES AMOUNT - TRANSACTION CANCELLED');
      return;
    }

    const userSharesBN = vaultInfo.userShares;
    // Convert decimal shares back to raw format (multiply by 1e9)
    const sharesBN = new BN(Math.floor(shares * 1e9));
    
    if (sharesBN.gt(userSharesBN)) {
      addLog('error', `INSUFFICIENT SHARES - MAX: ${(userSharesBN.toNumber() / 1e9).toFixed(4)}`);
      return;
    }

    setIsWithdrawing(true);
    addLog('withdraw', `INITIATING WITHDRAW: ${shares} SHARES`);

    try {
      addLog('info', 'BUILDING VAULT WITHDRAW TRANSACTION');
      
      const signature = await withdraw(sharesBN);
      
      if (signature) {
        addLog('success', `WITHDRAW SUCCESSFUL: ${signature.substring(0, 12)}...`);
        
        const estimatedValue = (shares / vaultInfo.totalShares.toNumber()) * vaultInfo.totalValue;
        
        const txId = `TX${Date.now().toString(36).toUpperCase()}`;
        setTransactions(prev => [{
          id: txId,
          type: 'WITHDRAW',
          amount: `${estimatedValue.toFixed(4)} SOL`,
          shares: `${shares}`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          status: 'CONFIRMED'
        }, ...prev.slice(0, 9)]);
        
        setWithdrawShares('');
        addLog('info', 'VAULT POSITION UPDATED - SOL WITHDRAWN');
      }
    } catch (error) {
      addLog('error', `WITHDRAW FAILED: ${error instanceof Error ? error.message : 'UNKNOWN'}`);
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-[1800px] mx-auto">
        <div className="cyber-card p-6 mb-6 bg-black/90 backdrop-blur-sm">
          <pre className="text-[11px] md:text-sm text-[#9333ea] leading-tight mb-4 overflow-x-auto">
{`
 █████╗ ████████╗ ██████╗ ███╗   ███╗██╗  ██╗
██╔══██╗╚══██╔══╝██╔═══██╗████╗ ████║╚██╗██╔╝
███████║   ██║   ██║   ██║██╔████╔██║ ╚███╔╝
██╔══██║   ██║   ██║   ██║██║╚██╔╝██║ ██╔██╗
██║  ██║   ██║   ╚██████╔╝██║ ╚═╝ ██║██╔╝ ██╗
╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝

        LIQUIDITY VAULT // YIELD AGGREGATION SYSTEM
`}
          </pre>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="font-mono text-xs">
              <span className="text-white">NETWORK:</span>{' '}
              <span className="text-[#9333ea]">SOLANA-MAINNET</span>
              <span className="text-white ml-4">LATENCY:</span>{' '}
              <span className={vaultLatency < 200 ? 'text-[#9333ea]' : vaultLatency < 500 ? 'text-[#ffff00]' : 'text-[#ff0000]'}>
                {vaultLatency}ms
              </span>
              <span className="text-white ml-4">STATUS:</span>{' '}
              <span className="text-[#9333ea]">OPERATIONAL</span>
            </div>
            <div className="font-mono text-xs">
              <span className="text-white">WALLET:</span>{' '}
              <span className={connected ? 'text-[#9333ea]' : 'text-[#ff0000]'}>
                {connected ? `[${publicKey?.toString().slice(0, 8)}...]` : '[DISCONNECTED]'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_420px] gap-6">
          <div className="space-y-6">
            <div className="cyber-card p-6 bg-black/90 backdrop-blur-sm">
              <h3 className="text-sm font-mono text-[#9333ea] mb-4 border-b border-[#9333ea]/30 pb-2">
                YOUR POSITION
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3 font-mono text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-800">
                    <span className="text-white">SHARES_OWNED</span>
                    <span className="text-[#9333ea]">{(vaultInfo.userShares.toNumber() / 1e9).toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-800">
                    <span className="text-white">SHARE_PRICE</span>
                    <span className="text-[#9333ea]">{vaultInfo.totalShares.gt(new BN(0)) ? (vaultInfo.totalValue / (vaultInfo.totalShares.toNumber() / 1e9)).toFixed(6) : '1.000000'} SOL</span>
                  </div>
                </div>
                <div className="space-y-3 font-mono text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-800">
                    <span className="text-white">TOTAL_VALUE</span>
                    <span className="text-[#ffff00] text-lg font-bold">{vaultInfo.userValue.toFixed(4)} SOL</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-800">
                    <span className="text-white">POOL_SHARE</span>
                    <span className="text-[#9333ea]">{vaultInfo.totalShares.gt(new BN(0)) ? ((vaultInfo.userShares.toNumber() / vaultInfo.totalShares.toNumber()) * 100).toFixed(2) : '0.00'}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="cyber-card p-6 bg-black/90 backdrop-blur-sm">
                <h3 className="text-sm font-mono text-[#9333ea] mb-4 border-b border-[#9333ea]/30 pb-2">
                  DEPOSIT SOL
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-white font-mono mb-2 block">
                      AMOUNT_SOL {connected && balance !== null && (
                        <span className="text-[#ffff00] ml-2">BALANCE: {balance.toFixed(4)}</span>
                      )}
                    </label>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black border border-[#9333ea]/30 px-4 py-3 text-[#9333ea] font-mono text-lg focus:outline-none focus:border-[#9333ea]"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[25, 50, 75, 100].map((percent) => (
                      <button
                        key={percent}
                        onClick={() => {
                          const availableBalance = balance || 0;
                          // Reserve 0.01 SOL for transaction fees
                          const reservedForFees = 0.01;
                          const usableBalance = Math.max(0, availableBalance - reservedForFees);
                          const amount = (usableBalance * percent / 100);
                          setDepositAmount(amount.toFixed(4));
                        }}
                        disabled={!connected || !balance}
                        className="px-2 py-2 bg-black border border-gray-700 hover:border-[#9333ea] transition-colors font-mono text-xs text-white hover:text-[#9333ea] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {percent}%
                      </button>
                    ))}
                  </div>
                  {depositAmount && (
                    <div className="text-xs font-mono text-white border-t border-gray-800 pt-3">
                      <div className="flex justify-between mb-1">
                        <span>EST_SHARES</span>
                        <span className="text-[#9333ea]">{(parseFloat(depositAmount) * 1000).toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>POOL_IMPACT</span>
                        <span className="text-[#ffff00]">+0.00%</span>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleDeposit}
                    disabled={!connected || !depositAmount || isDepositing}
                    className="w-full py-3 border border-[#9333ea] text-[#9333ea] font-mono text-sm hover:bg-[#9333ea] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    {isDepositing ? '[DEPOSITING...]' : '[DEPOSIT]'}
                  </button>
                </div>
              </div>

              <div className="cyber-card p-6 bg-black/90 backdrop-blur-sm">
                <h3 className="text-sm font-mono text-[#ff9900] mb-4 border-b border-[#ff9900]/30 pb-2">
                  WITHDRAW FUNDS
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-white font-mono mb-2 block">SHARES_AMOUNT</label>
                    <input
                      type="number"
                      value={withdrawShares}
                      onChange={(e) => setWithdrawShares(e.target.value)}
                      placeholder="0"
                      className="w-full bg-black border border-[#ff9900]/30 px-4 py-3 text-[#ff9900] font-mono text-lg focus:outline-none focus:border-[#ff9900]"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[25, 50, 75, 100].map((percent) => (
                      <button
                        key={percent}
                        onClick={() => {
                          const userShares = vaultInfo.userShares;
                          const withdrawAmountRaw = userShares.muln(percent).divn(100);
                          // Convert to decimal format for display (divide by 1e9 like in the shares display)
                          const withdrawAmountFormatted = (withdrawAmountRaw.toNumber() / 1e9).toFixed(4);
                          setWithdrawShares(withdrawAmountFormatted);
                        }}
                        disabled={!connected || vaultInfo.userShares.isZero()}
                        className="px-2 py-2 bg-black border border-gray-700 hover:border-[#ff9900] transition-colors font-mono text-xs text-white hover:text-[#ff9900] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {percent}%
                      </button>
                    ))}
                  </div>
                  {withdrawShares && (
                    <div className="text-xs font-mono text-white border-t border-gray-800 pt-3">
                      <div className="flex justify-between mb-1">
                        <span>EST_VALUE</span>
                        <span className="text-[#ff9900]">
                          {vaultInfo.totalShares.gt(new BN(0)) 
                            ? ((parseFloat(withdrawShares) / vaultInfo.totalShares.toNumber()) * vaultInfo.totalValue).toFixed(4) 
                            : '0.0000'} SOL
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>POOL_IMPACT</span>
                        <span className="text-[#ffff00]">
                          -{vaultInfo.totalShares.gt(new BN(0)) 
                            ? ((parseFloat(withdrawShares) / vaultInfo.totalShares.toNumber()) * 100).toFixed(2) 
                            : '0.00'}%
                        </span>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleWithdraw}
                    disabled={!connected || !withdrawShares || isWithdrawing}
                    className="w-full py-3 border border-[#ff9900] text-[#ff9900] font-mono text-sm hover:bg-[#ff9900] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    {isWithdrawing ? '[WITHDRAWING...]' : '[WITHDRAW]'}
                  </button>
                </div>
              </div>
            </div>

            <div className="cyber-card p-6 bg-black/90 backdrop-blur-sm">
              <h3 className="text-sm font-mono text-[#ffff00] mb-4 border-b border-[#ffff00]/30 pb-2">
                VAULT MECHANISM
              </h3>
              <div className="space-y-2 font-mono text-xs text-white">
                <p>▸ 01: DEPOSIT_USDC → RECEIVE_PROPORTIONAL_SHARES</p>
                <p>▸ 02: VAULT_EXECUTES_ARBITRAGE_STRATEGIES</p>
                <p>▸ 03: EXECUTORS_RECEIVE_10%_FEE_ON_PROFITS</p>
                <p>▸ 04: 90%_PROFIT_DISTRIBUTED_TO_VAULT_HOLDERS</p>
                <p>▸ 05: WITHDRAW_ANYTIME → BURN_SHARES → RECEIVE_USDC</p>
                <p>▸ 06: SHARE_PRICE_INCREASES_WITH_VAULT_PROFITS</p>
                <p className="text-white mt-3">※ PERMISSIONLESS // TRUSTLESS // ON-CHAIN</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="cyber-card p-4 bg-black/90 backdrop-blur-sm">
              <h3 className="text-sm font-mono text-[#9333ea] mb-3 border-b border-[#9333ea]/30 pb-2 flex items-center justify-between">
                <span>SYSTEM LOGS</span>
                <span className="text-white">[LIVE]</span>
              </h3>
              <div className="h-96 overflow-y-auto space-y-1 font-mono text-[10px] custom-scrollbar">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-gray-700">[{log.timestamp}]</span>
                    <span className={
                      log.type === 'success' ? 'text-[#9333ea]' :
                      log.type === 'error' ? 'text-[#ff0000]' :
                      log.type === 'deposit' ? 'text-[#9333ea]' :
                      log.type === 'withdraw' ? 'text-[#ff9900]' :
                      'text-white'
                    }>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>

            <div className="cyber-card p-4 bg-black/90 backdrop-blur-sm">
              <h3 className="text-sm font-mono text-[#ff9900] mb-3 border-b border-[#ff9900]/30 pb-2">
                TRANSACTION HISTORY
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {transactions.length === 0 ? (
                  <div className="text-center py-8 text-gray-700 font-mono text-xs">
                    NO_TRANSACTIONS_YET
                  </div>
                ) : (
                  transactions.map((tx) => (
                    <div key={tx.id} className="border border-gray-800 p-3 font-mono text-[10px]">
                      <div className="flex items-center justify-between mb-1">
                        <span className={tx.type === 'DEPOSIT' ? 'text-[#9333ea]' : 'text-[#ff9900]'}>
                          [{tx.type}]
                        </span>
                        <span className="text-white">{tx.timestamp}</span>
                      </div>
                      <div className="flex items-center justify-between text-white">
                        <span>AMOUNT: {tx.amount}</span>
                        <span>SHARES: {tx.shares}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-gray-700">TX: {tx.id.substring(0, 16)}...</span>
                        <span className={
                          tx.status === 'CONFIRMED' ? 'text-[#9333ea]' :
                          tx.status === 'PENDING' ? 'text-[#ffff00]' :
                          'text-[#ff0000]'
                        }>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="cyber-card p-4 bg-black/90 backdrop-blur-sm">
              <h3 className="text-xs font-mono text-[#ffff00] mb-3 border-b border-[#ffff00]/30 pb-2">
                VAULT CONFIG
              </h3>
              <div className="space-y-2 font-mono text-xs text-white">
                <p>▸ NETWORK: SOLANA_DEVNET</p>
                <p>▸ ASSET: SOL_NATIVE_TOKEN</p>
                <p>▸ STRATEGY: ARBITRAGE_EXECUTION</p>
                <p>▸ EXECUTOR_FEE: 10%_OF_PROFITS</p>
                <p>▸ VAULT_SHARE: 90%_OF_PROFITS</p>
                <p>▸ MIN_DEPOSIT: 0.001_SOL</p>
                <p>▸ WITHDRAW_FEE: 0%</p>
                <p>▸ LOCK_PERIOD: NONE</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
