'use client';

import { useState, useEffect, useRef } from 'react';
import ArbitrageCard from '@/components/ArbitrageCard';
import { ArbitrageOpportunity } from '@/types';
import { useArbitrage } from '@/hooks/useArbitrage';
import { useScanner } from '@/hooks/useScanner';
import { executeArbitrage } from '@/lib/execution';
import { useWallet } from '@/contexts/WalletContext';

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'scan' | 'PRICE' | 'ROUTE' | 'SCAN' | 'SYSTEM' | 'WS' | 'opportunity';
  message: string;
  category?: string;
  level?: string;
  id?: string;
}

interface OpportunityAlert {
  id: string;
  timestamp: string;
  priceSpread?: string;
  forwardRate?: string;
  reverseRate?: string;
  profitUSD?: string;
  inputToken?: string;
  outputToken?: string;
  tokenPair?: string;
  route?: string[];
  isExecutable: boolean;
}

export default function ArbitragePage() {
  const { connected, publicKey } = useWallet();
  const [minProfit] = useState(-10);
  const [enableScan, setEnableScan] = useState(false);
  const { opportunities: fallbackOpportunities, loading: fallbackLoading, refresh } = useArbitrage(minProfit, enableScan);
  
  // State for scanner logs (to show in live opportunities section)
  const [scannerLogs, setScannerLogs] = useState<LogEntry[]>([]);
  
  // State for structured opportunity alerts
  const [opportunityAlerts, setOpportunityAlerts] = useState<OpportunityAlert[]>([]);
  
  // State for view more functionality
  const [showAllOpportunities, setShowAllOpportunities] = useState(false);

  // Handle scanner log messages
  const handleScannerLog = (logData: any) => {
    // Filter out noise - only show scanning-related logs
    const allowedCategories = ['PRICE', 'ROUTE', 'SCAN'];
    const isOpportunity = logData.message?.toLowerCase().includes('opportunity') || 
                         logData.message?.includes('ARBITRAGE OPPORTUNITY') ||
                         logData.message?.includes('Price Spread') ||
                         logData.message?.includes('Forward Rate') ||
                         logData.message?.includes('Reverse Rate');
    
    // Skip API health checks, WebSocket connections, and other noise
    if (logData.category === 'API' && (
      logData.message?.includes('/health') ||
      logData.message?.includes('GET /') ||
      logData.message?.includes('POST /')
    )) {
      return;
    }
    if (logData.category === 'WS' && (
      logData.message?.includes('Client connected') || 
      logData.message?.includes('Broadcasted to') ||
      logData.message?.includes('Client disconnected') ||
      logData.message?.includes('clients')
    )) {
      return;
    }
    
    // Filter out individual rate/spread messages from live display (but keep for opportunity parsing)
    const isIndividualRate = logData.message?.includes('Price Spread:') || 
                            logData.message?.includes('Forward Rate:') || 
                            logData.message?.includes('Reverse Rate:');
    
    // Only allow scanning categories or main opportunity messages (not individual rates)
    if (!allowedCategories.includes(logData.category) && !isOpportunity) {
      return;
    }
    
    const timestamp = new Date(logData.timestamp || Date.now()).toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    
    const logEntry: LogEntry = {
      timestamp,
      type: logData.category || 'info',
      message: logData.message || '',
      category: logData.category,
      level: logData.level
    };
    
    // If this is an arbitrage opportunity, add it to the opportunity alerts
    if (isOpportunity) {
      // Only add to opportunity alerts logs if it's the main opportunity message
      if (!isIndividualRate) {
        addLog('opportunity', logData.message || '');
      }
      
      // Parse arbitrage opportunity data for structured alerts
      const message = logData.message || '';
      if (message.includes('ARBITRAGE OPPORTUNITY')) {
        const opportunityId = `${timestamp}-${Date.now()}`;
        const newAlert: OpportunityAlert = {
          id: opportunityId,
          timestamp,
          tokenPair: 'SOL/USDC', // Default, will be enhanced later
          isExecutable: true
        };
        
        setOpportunityAlerts(prev => [...prev.slice(-9), newAlert]);
      } else if (message.includes('Price Spread:')) {
        const spread = message.split('Price Spread:')[1]?.trim();
        setOpportunityAlerts(prev => {
          if (prev.length > 0) {
            const updated = [...prev];
            updated[updated.length - 1].priceSpread = spread;
            return updated;
          }
          return prev;
        });
      } else if (message.includes('Forward Rate:')) {
        const rate = message.split('Forward Rate:')[1]?.trim();
        setOpportunityAlerts(prev => {
          if (prev.length > 0) {
            const updated = [...prev];
            updated[updated.length - 1].forwardRate = rate;
            return updated;
          }
          return prev;
        });
      } else if (message.includes('Reverse Rate:')) {
        const rate = message.split('Reverse Rate:')[1]?.trim();
        setOpportunityAlerts(prev => {
          if (prev.length > 0) {
            const updated = [...prev];
            updated[updated.length - 1].reverseRate = rate;
            return updated;
          }
          return prev;
        });
      }
    }
    
    // Only add to scanner logs if it's not an individual rate/spread message
    if (!isIndividualRate) {
      setScannerLogs(prev => {
        // Create unique identifier for this log entry
        const logId = `${logEntry.timestamp}-${logData.timestamp || Date.now()}-${logEntry.message.slice(0, 20)}`;
        
        // Prevent duplicates by checking if we already have this exact log
        const isDuplicate = prev.some(log => {
          const existingId = `${log.timestamp}-${log.category || ''}-${log.message.slice(0, 20)}`;
          return existingId === logId || (
            log.timestamp === logEntry.timestamp && 
            log.message === logEntry.message &&
            Math.abs(new Date(logData.timestamp || Date.now()).getTime() - new Date().getTime()) < 1000
          );
        });
        
        if (isDuplicate) return prev;
        
        return [...prev.slice(-99), { ...logEntry, id: logId }];
      });
    }
  };
  
  // Handle scanner opportunity messages
  const handleScannerOpportunity = (opportunityData: any) => {
    addLog('opportunity', `OPPORTUNITY DETECTED: ${opportunityData.profitUSD?.toFixed(2) || 'N/A'}$ profit`);
  };
  
  const scanner = useScanner(handleScannerLog, handleScannerOpportunity);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [bootComplete, setBootComplete] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [networkLatency, setNetworkLatency] = useState(0);
  
  // Use scanner opportunities if available, otherwise fallback to local arbitrage
  const opportunities = scanner.connected ? scanner.opportunities.map(op => ({
    id: op.id,
    profitPercentage: op.profitPercentage,
    estimatedProfit: op.profitUSD,
    requiredAmount: 1000, // Default amount
    path: op.route || [],
    confidence: 0.8,
    estimatedGas: 0.01,
    dexes: ['Jupiter'],
    tokens: [op.inputToken, op.outputToken],
    timestamp: op.timestamp || Date.now()
  } as ArbitrageOpportunity)) : fallbackOpportunities;

  // Log scanner connection status for debugging
  useEffect(() => {
    console.log('Scanner connection status:', {
      connected: scanner.connected,
      isRunning: scanner.isRunning,
      opportunities: scanner.opportunities.length,
      error: scanner.error,
      status: scanner.status,
      fullStatus: scanner.fullStatus,
      opportunitiesData: scanner.opportunitiesData
    });
  }, [scanner.connected, scanner.isRunning, scanner.opportunities.length, scanner.error, scanner.status, scanner.fullStatus, scanner.opportunitiesData]);
  
  const loading = scanner.connected ? scanner.loading : fallbackLoading;

  const addLog = (type: LogEntry['type'], message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Only add to opportunity alerts if it's an opportunity or important system message
    if (type === 'opportunity' || (type === 'SYSTEM' && (message.includes('SCANNER') || message.includes('READY')))) {
      setLogs(prev => [...prev.slice(-50), { timestamp, type, message }]);
    }
  };

  const handleExecuteArbitrage = async (opportunityId: string) => {
    const opportunity = opportunityAlerts.find(op => op.id === opportunityId);
    if (!opportunity) return;

    if (!connected || !publicKey) {
      addLog('error', 'WALLET NOT CONNECTED - CONNECT PHANTOM WALLET TO EXECUTE');
      return;
    }

    addLog('info', `EXECUTING ARBITRAGE [${opportunity.timestamp}] - PROFIT: ${opportunity.priceSpread || 'N/A'}`);
    
    // Mark opportunity as non-executable during execution
    setOpportunityAlerts(prev => 
      prev.map(op => 
        op.id === opportunityId 
          ? { ...op, isExecutable: false }
          : op
      )
    );

    try {
      // Calculate minimum profit in SOL (convert from percentage)
      const spreadPercent = opportunity.priceSpread ? parseFloat(opportunity.priceSpread.replace('%', '')) : 0;
      const minProfitSOL = spreadPercent > 0 ? (0.1 * (spreadPercent / 100)) : 0.01; // Minimum 0.01 SOL profit
      
      addLog('info', 'BUILDING ARBITRAGE TRANSACTION VIA VAULT CONTRACT');
      addLog('info', `MIN PROFIT REQUIRED: ${minProfitSOL.toFixed(4)} SOL`);
      
      // Create mock Jupiter instruction data for arbitrage
      // In real implementation, this would come from the scanner
      const mockJupiterData = Buffer.from([1, 2, 3, 4]); // Placeholder
      
      // Execute arbitrage via vault contract
      const signature = await executeArbitrage(
        publicKey,
        mockJupiterData,
        minProfitSOL,
        async (transaction) => {
          if (!window.solana) {
            throw new Error('Phantom wallet not found');
          }
          return await window.solana.signTransaction(transaction);
        }
      );
      
      addLog('success', `ARBITRAGE EXECUTED SUCCESSFULLY - ID: ${opportunityId.slice(-8)}`);
      addLog('info', `TRANSACTION: ${signature}`);
      addLog('info', `VIEW ON EXPLORER: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
      
      // Remove executed opportunity after 5 seconds
      setTimeout(() => {
        setOpportunityAlerts(prev => prev.filter(op => op.id !== opportunityId));
      }, 5000);
      
    } catch (error) {
      addLog('error', `ARBITRAGE EXECUTION FAILED - ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Arbitrage execution error:', error);
      
      // Re-enable execution on failure
      setOpportunityAlerts(prev => 
        prev.map(op => 
          op.id === opportunityId 
            ? { ...op, isExecutable: true }
            : op
        )
      );
    }
  };

  useEffect(() => {
    const bootSequence = async () => {
      const messages = [
        'INITIALIZING ATOMX TERMINAL v2.1.0',
        'LOADING SOLANA MAINNET RPC CONNECTION',
        'CONNECTING TO JUPITER AGGREGATOR V6',
        'INITIALIZING ARBITRAGE DETECTION ENGINE',
        'LOADING DEX LIQUIDITY POOLS',
        'CALIBRATING PROFIT CALCULATION MATRIX',
        'ESTABLISHING WEBSOCKET CONNECTIONS',
        scanner.connected ? 'SCANNER API - CONNECTION ESTABLISHED' : 'SCANNER API - OFFLINE (FALLBACK MODE)',
        'SYSTEM READY - MAINNET ARBITRAGE SCANNER ONLINE'
      ];

      for (let i = 0; i < messages.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 150));
        addLog('info', messages[i]);
      }
      setBootComplete(true);
      
      if (scanner.connected) {
        addLog('success', 'SCANNER API READY - CLICK [START SCANNER] FOR LIVE LOG STREAMING');
        addLog('info', 'SYSTEM LOGS WILL SHOW REAL-TIME SCANNER ACTIVITY');
      } else {
        addLog('success', 'FALLBACK MODE READY - CLICK [SCAN] FOR MANUAL SEARCH');
      }
    };

    bootSequence();
  }, [scanner.connected]);

  useEffect(() => {
    if (bootComplete && enableScan && opportunities.length > 0) {
      setScanCount(prev => prev + 1);
      addLog('scan', `SCAN #${scanCount + 1} COMPLETED - FOUND ${opportunities.length} ROUTES`);

      const profitable = opportunities.filter(o => o.profitPercentage > 0.1);
      if (profitable.length > 0) {
        addLog('success', `DETECTED ${profitable.length} PROFITABLE OPPORTUNITIES`);
      } else {
        addLog('info', `FOUND ${opportunities.length} ROUTES - SHOWING ALL PATHS`);
      }
    }
  }, [opportunities, bootComplete]);

  useEffect(() => {
    const measureLatency = async () => {
      const start = performance.now();
      try {
        // Use scanner API health check if available, otherwise fallback to Jupiter
        if (scanner.connected) {
          const apiUrl = process.env.NEXT_PUBLIC_SCANNER_API_URL || 'http://localhost:3002';
          await fetch(`${apiUrl}/health`);
        } else {
          await fetch('https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&onlyDirectRoutes=true', {
            mode: 'cors'
          });
        }
        const latency = Math.round(performance.now() - start);
        setNetworkLatency(latency);
      } catch (error) {
        console.warn('Latency check failed:', error);
        setNetworkLatency(999);
      }
    };

    measureLatency();
    const interval = setInterval(measureLatency, 10000);
    return () => clearInterval(interval);
  }, [scanner.connected]);

  // Removed auto-scroll for opportunity alerts

  // Removed auto-scroll for scanner logs to prevent unwanted scrolling

  // Log scanner errors
  useEffect(() => {
    if (scanner.error) {
      addLog('error', `SCANNER API: ${scanner.error}`);
    }
  }, [scanner.error]);

  // Log scanner status changes
  useEffect(() => {
    if (scanner.status && bootComplete) {
      const status = scanner.isRunning ? 'RUNNING' : 'STOPPED';
      addLog('info', `SCANNER STATUS: ${status} | SCANS: ${scanner.status.scanCount || 0}`);
    }
  }, [scanner.status, scanner.isRunning, bootComplete]);

  const handleRefresh = async () => {
    if (scanner.connected) {
      addLog('scan', 'SCANNER API - MANUAL SCAN INITIATED');
      try {
        await scanner.manualScan();
        addLog('success', 'SCANNER API - MANUAL SCAN COMPLETED');
      } catch (error) {
        addLog('error', `SCANNER API ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      if (!enableScan) setEnableScan(true);
      addLog('scan', 'FALLBACK MODE - ANALYZING MARKET');
      await refresh();
    }
  };

  const handleStartScanning = async () => {
    if (scanner.connected) {
      addLog('SYSTEM', '🟣 [SYSTEM] STARTING SCANNER API - LIVE LOG STREAMING ENABLED');
      try {
        await scanner.startScanner({
          scanInterval: 30000,
          minProfitUSD: minProfit,
          minProfitPercentage: 0.5
        });
        addLog('SYSTEM', '🟣 [SYSTEM] SCANNER API STARTED - RECEIVING LIVE LOGS');
        setEnableScan(true);
      } catch (error) {
        addLog('error', `🟣 [SYSTEM] SCANNER START FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      setEnableScan(true);
      addLog('info', 'FALLBACK MODE - LOCAL SCANNING ENABLED');
      await refresh();
    }
  };

  const handleStopScanning = async () => {
    if (scanner.connected && scanner.isRunning) {
      addLog('SYSTEM', '🟣 [SYSTEM] STOPPING SCANNER API');
      try {
        await scanner.stopScanner();
        addLog('SYSTEM', '🟣 [SYSTEM] SCANNER API STOPPED - LOG STREAMING ENDED');
        setEnableScan(false);
      } catch (error) {
        addLog('error', `🟣 [SYSTEM] SCANNER STOP FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      setEnableScan(false);
      addLog('SYSTEM', '🟣 [SYSTEM] SCANNING DISABLED');
    }
  };



  return (
    <div className="min-h-screen p-2 sm:p-4 md:p-6">
      <div className="max-w-[1800px] mx-auto">
        <div className="cyber-card p-3 sm:p-4 md:p-6 mb-4 md:mb-6 bg-black/90 backdrop-blur-sm">
          <pre className="text-[8px] xs:text-[9px] sm:text-[11px] md:text-sm text-[#9333ea] leading-tight mb-2 sm:mb-4 overflow-x-auto">
{`
 █████╗ ████████╗ ██████╗ ███╗   ███╗██╗  ██╗
██╔══██╗╚══██╔══╝██╔═══██╗████╗ ████║╚██╗██╔╝
███████║   ██║   ██║   ██║██╔████╔██║ ╚███╔╝
██╔══██║   ██║   ██║   ██║██║╚██╔╝██║ ██╔██╗
██║  ██║   ██║   ╚██████╔╝██║ ╚═╝ ██║██╔╝ ██╗
╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝

      MAINNET ARBITRAGE SCANNER // EXECUTION PROTOCOL
`}
          </pre>
          <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
            <div className="font-mono text-[10px] sm:text-xs">
              <div className="flex flex-wrap gap-1 sm:gap-4">
                <span>
                  <span className="text-white">NETWORK:</span>{' '}
                  <span className="text-[#9333ea]">SOLANA-DEVNET</span>
                </span>
                <span>
                  <span className="text-white">LATENCY:</span>{' '}
                  <span className={networkLatency < 200 ? 'text-[#9333ea]' : networkLatency < 500 ? 'text-[#ffff00]' : 'text-[#ff0000]'}>
                    {networkLatency}ms
                  </span>
                </span>
                <span>
                  <span className="text-white">SCANS:</span>{' '}
                  <span className="text-[#ff9900]">{scanCount}</span>
                </span>
              </div>
            </div>
            <div className="flex gap-1 sm:gap-2">
              {scanner.connected && scanner.isRunning ? (
                <button
                  onClick={handleStopScanning}
                  disabled={loading}
                  className="border border-[#ff0000] px-2 sm:px-4 py-1 sm:py-2 text-[#ff0000] hover:bg-[#ff0000] hover:text-black disabled:opacity-30 transition-colors font-mono text-[10px] sm:text-xs"
                >
                  {loading ? '[STOPPING...]' : '[STOP SCANNER]'}
                </button>
              ) : (
                <button
                  onClick={scanner.connected ? handleStartScanning : handleRefresh}
                  disabled={loading}
                  className="border border-[#9333ea] px-2 sm:px-4 py-1 sm:py-2 text-[#9333ea] hover:bg-[#9333ea] hover:text-black disabled:opacity-30 transition-colors font-mono text-[10px] sm:text-xs"
                >
                  {loading ? '[SCANNING...]' : scanner.connected ? '[START SCANNER]' : '[SCAN NOW]'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4 md:gap-6">
          <div className="space-y-4 md:space-y-6">
            <div className="cyber-card p-3 sm:p-4 md:p-6 bg-black/90 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="font-mono text-xs sm:text-sm">
                  <span className="text-[#9333ea]">LIVE SCANNER ACTIVITY</span>
                  <span className="text-white ml-2">[{scannerLogs.length}]</span>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-64 sm:h-80 md:h-96 border-2 border-dashed border-gray-800">
                  <div className="text-center px-4">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 border-3 border-[#9333ea] border-t-transparent rounded-full animate-spin mx-auto mb-2 sm:mb-4" />
                    <p className="text-white font-mono text-sm sm:text-lg">SCANNING LIQUIDITY POOLS...</p>
                    <p className="text-gray-700 font-mono text-[10px] sm:text-xs mt-1 sm:mt-2">CHECKING 64 TOKEN PAIRS</p>
                  </div>
                </div>
              ) : !enableScan && !scanner.isRunning ? (
                <div className="flex items-center justify-center h-64 sm:h-80 md:h-96 border-2 border-dashed border-gray-800">
                  <div className="text-center px-4">
                    <p className="text-white font-mono text-sm sm:text-lg mb-2 sm:mb-4">SCANNER READY</p>
                    <p className="text-gray-700 font-mono text-xs sm:text-sm mb-4 sm:mb-6">CLICK [START SCANNER] TO BEGIN LIVE SCANNING</p>
                    <button
                      onClick={scanner.connected ? handleStartScanning : handleRefresh}
                      className="border border-[#9333ea] px-3 sm:px-6 py-2 sm:py-3 text-[#9333ea] hover:bg-[#9333ea] hover:text-black transition-colors font-mono text-xs sm:text-sm"
                    >
                      {scanner.connected ? '[START SCANNER API]' : '[START SCANNING]'}
                    </button>
                  </div>
                </div>
              ) : scannerLogs.length === 0 ? (
                <div className="flex items-center justify-center h-64 sm:h-80 md:h-96 border-2 border-dashed border-gray-800">
                  <div className="text-center px-4">
                    <p className="text-white font-mono text-sm sm:text-lg mb-1 sm:mb-2">WAITING_FOR_SCANNER_LOGS</p>
                    <p className="text-gray-700 font-mono text-xs sm:text-sm">SCANNER RUNNING - LOGS WILL APPEAR HERE</p>
                    <p className="text-gray-800 font-mono text-[10px] sm:text-xs mt-2 sm:mt-4">REAL-TIME SCANNER ACTIVITY</p>
                  </div>
                </div>
              ) : (
                <div className="h-[400px] sm:h-[600px] md:h-[800px] overflow-y-auto pr-1 sm:pr-2 custom-scrollbar">
                  <div className="space-y-1 sm:space-y-2 font-mono text-[12px] sm:text-[14px] md:text-[16px] leading-relaxed tracking-wider" style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
                    {scannerLogs.map((log, i) => (
                      <div key={i} className="flex gap-1 sm:gap-3 p-1 sm:p-3 hover:bg-gray-900/50 transition-colors border-l-2 border-gray-800">
                        <span className="text-gray-400 flex-shrink-0 font-mono text-[9px] sm:text-[10px] md:text-[12px]">[{log.timestamp}]</span>
                        <span className="text-white font-mono text-[12px] sm:text-[14px] md:text-[16px] flex-1 break-words" style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 md:space-y-6">
            <div className="cyber-card p-2 sm:p-3 md:p-4 bg-black/90 backdrop-blur-sm">
              <h3 className="text-xs sm:text-sm font-mono text-[#9333ea] mb-2 sm:mb-3 border-b border-[#9333ea]/30 pb-1 sm:pb-2 flex items-center justify-between">
                <span>OPPORTUNITY ALERTS</span>
                <span className="text-white">[{opportunityAlerts.length}]</span>
              </h3>
              
              {/* Structured Arbitrage Opportunities */}
              {opportunityAlerts.length > 0 && (
                <div className="mb-4 space-y-3">
                  {(() => {
                    // Filter opportunities with profit > 0 and remove duplicates
                    const filteredOpportunities = opportunityAlerts
                      .filter((opportunity) => {
                        // Check for profit > 0 in multiple fields
                        const spreadPercent = opportunity.priceSpread ? parseFloat(opportunity.priceSpread.replace('%', '')) : 0;
                        const profitUSD = opportunity.profitUSD ? parseFloat(opportunity.profitUSD.replace('$', '')) : 0;
                        return spreadPercent > 0 || profitUSD > 0;
                      })
                      .filter((opportunity, index, arr) => {
                        // Remove duplicates - but less aggressively (allow 1% difference instead of 0.1%)
                        return arr.findIndex(op => {
                          const sameTokenPair = op.tokenPair === opportunity.tokenPair;
                          if (!sameTokenPair) return false;
                          
                          const currentProfit = parseFloat(opportunity.priceSpread?.replace('%', '') || '0');
                          const compareProfit = parseFloat(op.priceSpread?.replace('%', '') || '0');
                          const similarProfit = Math.abs(currentProfit - compareProfit) < 1.0; // 1% difference instead of 0.1%
                          
                          return sameTokenPair && similarProfit;
                        }) === index;
                      });
                    
                    // Limit displayed opportunities unless showing all
                    const displayedOpportunities = showAllOpportunities 
                      ? filteredOpportunities 
                      : filteredOpportunities.slice(0, 5);
                    
                    const hasMore = filteredOpportunities.length > 5;
                    
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] sm:text-xs font-mono text-[#ffff00] mb-1 sm:mb-2">
                            ARBITRAGE OPPORTUNITIES [{filteredOpportunities.length}]
                          </h4>
                          {hasMore && (
                            <button
                              onClick={() => setShowAllOpportunities(!showAllOpportunities)}
                              className="text-[10px] sm:text-xs font-mono text-[#9333ea] hover:text-white transition-colors"
                            >
                              {showAllOpportunities ? '[SHOW LESS]' : '[VIEW MORE]'}
                            </button>
                          )}
                        </div>
                        {displayedOpportunities.map((opportunity) => {
                    // Calculate estimated profit in USD based on price spread
                    const spreadPercent = opportunity.priceSpread ? parseFloat(opportunity.priceSpread.replace('%', '')) : 0;
                    const estimatedProfitUSD = spreadPercent > 0 ? (1000 * (spreadPercent / 100)).toFixed(2) : '0.00';
                    
                    return (
                      <div key={opportunity.id} className="border border-[#9333ea]/30 p-2 sm:p-3 md:p-4 bg-black/50 rounded-sm">
                        <div className="flex flex-col sm:flex-row items-start justify-between mb-2 sm:mb-3 gap-2">
                          <div className="flex-1">
                            <div className="text-[#9333ea] font-mono text-[9px] sm:text-xs mb-1">[{opportunity.timestamp}] ARBITRAGE DETECTED</div>
                            <div className="text-[#ffff00] font-mono text-xs sm:text-sm font-bold">
                              {opportunity.tokenPair || 'SOL/USDC'} • Est. ${estimatedProfitUSD} profit
                            </div>
                          </div>
                          <button
                            onClick={() => handleExecuteArbitrage(opportunity.id)}
                            disabled={!opportunity.isExecutable}
                            className={`px-2 sm:px-4 py-1 sm:py-2 text-[9px] sm:text-xs font-mono border transition-colors w-full sm:w-auto ${
                              opportunity.isExecutable
                                ? 'border-[#00ff00] text-[#00ff00] hover:bg-[#00ff00] hover:text-black'
                                : 'border-gray-600 text-gray-600 cursor-not-allowed'
                            }`}
                          >
                            {opportunity.isExecutable ? '[EXECUTE ARBITRAGE]' : '[EXECUTING...]'}
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 font-mono text-[9px] sm:text-[10px]">
                          {opportunity.priceSpread && (
                            <div className="space-y-1">
                              <span className="text-gray-400 block">PROFIT MARGIN</span>
                              <span className="text-[#00ff00] font-bold text-xs sm:text-sm">{opportunity.priceSpread}</span>
                            </div>
                          )}
                          <div className="space-y-1">
                            <span className="text-gray-400 block">TOKEN PAIR</span>
                            <span className="text-white">{opportunity.tokenPair || 'SOL/USDC'}</span>
                          </div>
                          {opportunity.forwardRate && (
                            <div className="space-y-1">
                              <span className="text-gray-400 block">FORWARD RATE</span>
                              <span className="text-white text-xs">{opportunity.forwardRate}</span>
                            </div>
                          )}
                          {opportunity.reverseRate && (
                            <div className="space-y-1">
                              <span className="text-gray-400 block">REVERSE RATE</span>
                              <span className="text-white text-xs">{opportunity.reverseRate}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="mt-2 sm:mt-3 pt-1 sm:pt-2 border-t border-[#9333ea]/20">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center font-mono text-[8px] sm:text-[9px] text-gray-400 gap-1 sm:gap-0">
                            <span>ROUTE: Jupiter Aggregator</span>
                            <span>GAS: ~0.005 SOL</span>
                            <span>SLIPPAGE: 0.5%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                      </>
                    );
                  })()}
                </div>
              )}
              
              {/* System Logs */}
              <div className="h-48 sm:h-56 md:h-64 overflow-y-auto space-y-1 font-mono text-[9px] sm:text-[10px] custom-scrollbar">
                <h4 className="text-[10px] sm:text-xs font-mono text-gray-400 mb-1 sm:mb-2 border-t border-gray-800 pt-1 sm:pt-2">SYSTEM LOGS</h4>
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-1 sm:gap-2">
                    <span className="text-gray-700 text-[8px] sm:text-[9px]">[{log.timestamp}]</span>
                    <span className={`${
                      log.type === 'opportunity' ? 'text-[#9333ea]' : // 🟣 Violet for opportunities
                      log.type === 'SYSTEM' ? 'text-[#9333ea]' :     // 🟣 Violet for system
                      log.type === 'success' ? 'text-[#9333ea]' :    // 🟣 Violet for success
                      log.type === 'error' ? 'text-[#ff0000]' :
                      'text-white'
                    } break-words`}>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
