'use client';

import { useState, useEffect, useRef } from 'react';
import { SwapCube as SwapCubeType, TokenInfo } from '@/types';
import { COMMON_TOKENS } from '@/lib/constants';
import { generateId, formatNumber } from '@/lib/utils';
import { getJupiterQuote } from '@/lib/jupiter';
import { useWallet } from '@/contexts/WalletContext';
import { executeComboSwaps, SwapParams } from '@/lib/execution';
import { JupiterUltraService } from '@/lib/jupiterUltra';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'quote';
  message: string;
}

interface StepOutput {
  amount: number;
  usdValue: number;
  token: TokenInfo;
}

function ActionCube({ cube, index, onUpdate, onRemove, previousOutput }: {
  cube: SwapCubeType;
  index: number;
  onUpdate: (cube: SwapCubeType) => void;
  onRemove: () => void;
  previousOutput?: StepOutput;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cube.id });

  const [estimatedOutput, setEstimatedOutput] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [priceImpact, setPriceImpact] = useState<number>(0);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const inputAmount = cube.amountIn || (index > 0 ? previousOutput?.amount : undefined);
  const inputToken = index === 0 ? cube.tokenIn : previousOutput?.token;

  useEffect(() => {
    if (index > 0 && previousOutput && cube.tokenOut) {
      onUpdate({
        ...cube,
        tokenIn: previousOutput.token,
        amountIn: cube.amountIn || previousOutput.amount
      });
    }
  }, [previousOutput, index]);

  useEffect(() => {
    if (!inputToken || !cube.tokenOut || !inputAmount) {
      setEstimatedOutput(null);
      return;
    }

    const fetchQuote = async () => {
      setLoading(true);
      try {
        const amountInLamports = Math.floor(inputAmount * Math.pow(10, inputToken.decimals));
        const quote = await getJupiterQuote(
          inputToken.mint,
          cube.tokenOut!.mint,
          amountInLamports
        );

        if (quote) {
          const output = parseInt(quote.outAmount) / Math.pow(10, cube.tokenOut!.decimals);
          setEstimatedOutput(output);
          const impact = parseFloat(quote.priceImpactPct || '0');
          setPriceImpact(Math.abs(impact));
        }
      } catch (error) {
        console.error('Error fetching quote:', error);
        setEstimatedOutput(null);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchQuote, 500);
    return () => clearTimeout(debounce);
  }, [inputToken, cube.tokenOut, inputAmount]);

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {index > 0 && (
        <div className="h-6 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="h-6 w-px bg-[#9333ea]" />
            <div className="font-mono text-xs text-white">
              OUTPUT → INPUT [{index}]
            </div>
            <div className="h-6 w-px bg-[#9333ea]" />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing font-mono text-xl text-white hover:text-[#9333ea]">
          ⣿
        </div>
        <div className="flex-1 cyber-card p-4 bg-black/90">
          <div className="flex items-center justify-between mb-4">
            <div className="font-mono text-xs text-white">
              STEP_{index + 1} // {cube.dex?.toUpperCase() || 'SELECT_DEX'}
            </div>
            <button
              onClick={onRemove}
              className="text-white hover:text-[#ff0000] transition-colors font-mono text-xs"
            >
              [X]
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {['jupiter', 'orca', 'raydium', 'meteora'].map((dex) => (
              <button
                key={dex}
                onClick={() => onUpdate({ ...cube, dex: dex as any })}
                className={`px-3 py-1 font-mono text-xs transition-colors border ${
                  cube.dex === dex
                    ? 'border-[#9333ea] text-[#9333ea]'
                    : 'border-gray-700 text-white hover:border-gray-500'
                }`}
              >
                {dex.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-white font-mono mb-1 block">
                {index === 0 ? 'INPUT_TOKEN' : 'AUTO_INPUT'}
              </label>
              {index === 0 ? (
                <select
                  value={cube.tokenIn?.symbol || ''}
                  onChange={(e) => {
                    const token = COMMON_TOKENS.find((t) => t.symbol === e.target.value);
                    onUpdate({ ...cube, tokenIn: token });
                  }}
                  className="w-full bg-black border border-[#9333ea]/30 px-3 py-2 text-[#9333ea] font-mono text-sm focus:outline-none focus:border-[#9333ea]"
                >
                  <option value="">SELECT</option>
                  {COMMON_TOKENS.map((token) => (
                    <option key={token.symbol} value={token.symbol}>
                      {token.symbol}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full bg-black border border-gray-700 px-3 py-2 text-gray-500 font-mono text-sm">
                  {inputToken?.symbol || 'PENDING'}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-white font-mono mb-1 block">
                AMOUNT
              </label>
              <input
                type="number"
                value={cube.amountIn || ''}
                onChange={(e) => onUpdate({ ...cube, amountIn: parseFloat(e.target.value) })}
                placeholder={index > 0 ? (previousOutput?.amount?.toFixed(4) || '0.00') : '0.00'}
                className="w-full bg-black border border-[#9333ea]/30 px-3 py-2 text-[#9333ea] font-mono text-sm focus:outline-none focus:border-[#9333ea]"
              />
            </div>
          </div>

          <div className="flex justify-center mb-3">
            <div className="font-mono text-xs text-white">SWAP ↓</div>
          </div>

          <div>
            <label className="text-xs text-white font-mono mb-1 block">OUTPUT_TOKEN</label>
            <select
              value={cube.tokenOut?.symbol || ''}
              onChange={(e) => {
                const token = COMMON_TOKENS.find((t) => t.symbol === e.target.value);
                onUpdate({ ...cube, tokenOut: token });
              }}
              className="w-full bg-black border border-[#ff9900]/30 px-3 py-2 text-[#ff9900] font-mono text-sm focus:outline-none focus:border-[#ff9900]"
            >
              <option value="">SELECT</option>
              {COMMON_TOKENS.map((token) => (
                <option key={token.symbol} value={token.symbol}>
                  {token.symbol}
                </option>
              ))}
            </select>
          </div>

          {loading && (
            <div className="mt-3 text-xs text-white font-mono border-t border-gray-800 pt-3">
              FETCHING_QUOTE...
            </div>
          )}

          {estimatedOutput !== null && !loading && (
            <div className="mt-3 text-xs font-mono border-t border-gray-800 pt-3">
              <div className="flex justify-between mb-1">
                <span className="text-white">EST_OUTPUT</span>
                <span className="text-[#ff9900]">{formatNumber(estimatedOutput, 4)} {cube.tokenOut?.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white">PRICE_IMPACT</span>
                <span className={priceImpact > 1 ? 'text-[#ff0000]' : 'text-[#9333ea]'}>
                  {priceImpact.toFixed(2)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComboBuilder() {
  const { connected, publicKey } = useWallet();
  const [cubes, setCubes] = useState<SwapCubeType[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [bootComplete, setBootComplete] = useState(false);
  const [outputs, setOutputs] = useState<StepOutput[]>([]);
  const [networkLatency, setNetworkLatency] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addLog = (type: LogEntry['type'], message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-50), { timestamp, type, message }]);
  };

  useEffect(() => {
    const bootSequence = async () => {
      const messages = [
        'INITIALIZING ATOMX COMBO TERMINAL v1.0.0',
        'LOADING SOLANA MAINNET RPC CONNECTION',
        'CONNECTING TO JUPITER AGGREGATOR V6',
        'INITIALIZING MULTI-STEP EXECUTION ENGINE',
        'LOADING DEX ROUTERS',
        'ESTABLISHING WEBSOCKET CONNECTIONS',
        'CALIBRATING SLIPPAGE TOLERANCE',
        'SYSTEM READY - COMBO BUILDER ONLINE'
      ];

      for (let i = 0; i < messages.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 150));
        addLog('info', messages[i]);
      }
      setBootComplete(true);
      addLog('success', 'COMBO SYSTEM OPERATIONAL - BUILD YOUR TRANSACTION CHAIN');
    };

    bootSequence();
  }, []);

  useEffect(() => {
    const measureLatency = async () => {
      const start = performance.now();
      try {
        await fetch('https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&onlyDirectRoutes=true');
        const latency = Math.round(performance.now() - start);
        setNetworkLatency(latency);
      } catch {
        setNetworkLatency(999);
      }
    };

    measureLatency();
    const interval = setInterval(measureLatency, 10000);
    return () => clearInterval(interval);
  }, []);

  // Removed auto-scroll for logs

  useEffect(() => {
    const calculateOutputs = async () => {
      const newOutputs: StepOutput[] = [];

      for (let i = 0; i < cubes.length; i++) {
        const cube = cubes[i];
        const inputAmount = i === 0 ? cube.amountIn : newOutputs[i - 1]?.amount;
        const inputToken = i === 0 ? cube.tokenIn : newOutputs[i - 1]?.token;

        if (!inputToken || !cube.tokenOut || !inputAmount) {
          break;
        }

        try {
          const amountInLamports = Math.floor(inputAmount * Math.pow(10, inputToken.decimals));
          const quote = await getJupiterQuote(inputToken.mint, cube.tokenOut.mint, amountInLamports);

          if (quote) {
            const output = parseInt(quote.outAmount) / Math.pow(10, cube.tokenOut.decimals);
            newOutputs.push({
              amount: output,
              usdValue: 0,
              token: cube.tokenOut,
            });
          }
        } catch (error) {
          console.error(`Error calculating step ${i}:`, error);
          break;
        }
      }

      setOutputs(newOutputs);
    };

    if (cubes.length > 0) {
      calculateOutputs();
    } else {
      setOutputs([]);
    }
  }, [cubes]);

  const addCube = () => {
    const newCube: SwapCubeType = {
      id: generateId(),
      type: 'swap',
      dex: 'jupiter',
    };
    setCubes([...cubes, newCube]);
    addLog('info', `STEP ${cubes.length + 1} ADDED TO COMBO`);
  };

  const updateCube = (id: string, updatedCube: SwapCubeType) => {
    setCubes(cubes.map((cube) => (cube.id === id ? updatedCube : cube)));
  };

  const removeCube = (id: string) => {
    const index = cubes.findIndex(c => c.id === id);
    setCubes(cubes.filter((cube) => cube.id !== id));
    addLog('info', `STEP ${index + 1} REMOVED FROM COMBO`);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setCubes((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        addLog('info', `STEP ${oldIndex + 1} MOVED TO POSITION ${newIndex + 1}`);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const simulateCombo = async () => {
    if (!isValidCombo) {
      addLog('error', 'INVALID COMBO CONFIGURATION');
      return;
    }

    setIsSimulating(true);
    addLog('info', `SIMULATING ${cubes.length}-STEP COMBO ON MAINNET`);
    addLog('info', 'FETCHING REAL JUPITER QUOTES FROM MAINNET...');

    try {
      let currentAmount = cubes[0].amountIn!;
      let currentToken = cubes[0].tokenIn!;
      const simulationResults = [];

      for (let i = 0; i < cubes.length; i++) {
        const cube = cubes[i];
        addLog('info', `SIMULATING STEP ${i + 1}: ${currentToken.symbol} → ${cube.tokenOut!.symbol}`);

        try {
          // Use Jupiter Ultra API for simulation - same as backend scanner
          const amountInLamports = Math.floor(currentAmount * Math.pow(10, currentToken.decimals));
          const ultraOrder = await JupiterUltraService.getQuote(
            currentToken.mint,
            cube.tokenOut!.mint,
            amountInLamports,
            50
          );

          if (ultraOrder) {
            const outputAmount = parseInt(ultraOrder.outAmount) / Math.pow(10, cube.tokenOut!.decimals);
            const priceImpact = parseFloat(ultraOrder.priceImpactPct || '0');
            const dexPath = ultraOrder.routePlan.map(r => r.swapInfo.label).join(' → ');
            
            simulationResults.push({
              step: i + 1,
              inputToken: currentToken.symbol,
              outputToken: cube.tokenOut!.symbol,
              inputAmount: currentAmount,
              outputAmount,
              priceImpact: Math.abs(priceImpact),
              router: ultraOrder.router,
              dexPath
            } as any);

            addLog('success', `  INPUT: ${currentAmount.toFixed(4)} ${currentToken.symbol}`);
            addLog('success', `  OUTPUT: ${outputAmount.toFixed(4)} ${cube.tokenOut!.symbol}`);
            addLog('info', `  PRICE IMPACT: ${Math.abs(priceImpact).toFixed(2)}%`);
            addLog('info', `  DEX PATH: ${dexPath}`);
            addLog('info', `  ROUTER: ${ultraOrder.router}`);
            addLog('info', `  RATE: 1 ${currentToken.symbol} = ${(outputAmount / currentAmount).toFixed(6)} ${cube.tokenOut!.symbol}`);

            // Update for next iteration
            currentAmount = outputAmount;
            currentToken = cube.tokenOut!;
          } else {
            addLog('error', `  FAILED TO GET QUOTE FOR ${currentToken.symbol} → ${cube.tokenOut!.symbol}`);
            break;
          }
        } catch (error) {
          addLog('error', `  STEP ${i + 1} SIMULATION FAILED: ${error instanceof Error ? error.message : 'Unknown'}`);
          break;
        }
      }

      if (simulationResults.length === cubes.length) {
        const finalResult = simulationResults[simulationResults.length - 1];
        const initialInput = simulationResults[0];
        const totalPriceImpact = simulationResults.reduce((sum, result) => sum + result.priceImpact, 0);
        
        addLog('success', ' SIMULATION COMPLETE - MAINNET JUPITER ULTRA RESULTS:');
        addLog('info', ` STARTING: ${initialInput.inputAmount} ${initialInput.inputToken}`);
        addLog('info', ` ENDING: ${finalResult.outputAmount.toFixed(4)} ${finalResult.outputToken}`);
        addLog('info', ` TOTAL PRICE IMPACT: ${totalPriceImpact.toFixed(2)}%`);
        addLog('info', `TOTAL STEPS: ${simulationResults.length}`);
        addLog('info', ` PRIMARY ROUTER: ${finalResult.router || 'Jupiter V6'}`);
        
        // Calculate profit/loss if same token
        if (initialInput.inputToken === finalResult.outputToken) {
          const profitLoss = ((finalResult.outputAmount - initialInput.inputAmount) / initialInput.inputAmount) * 100;
          addLog(profitLoss > 0 ? 'success' : 'error', 
            ` NET RESULT: ${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)}% ${profitLoss > 0 ? 'PROFIT' : 'LOSS'}`
          );
        }
        
        addLog('info', ' SIMULATION USES JUPITER ULTRA API WITH MAINNET LIQUIDITY');
        addLog('info', 'ACTUAL DEVNET EXECUTION USES MOCK DATA - RESULTS WILL DIFFER');
      }
    } catch (error) {
      addLog('error', `SIMULATION FAILED: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const executeCombo = async () => {
    if (!isValidCombo) {
      addLog('error', 'INVALID COMBO CONFIGURATION');
      return;
    }

    if (!connected || !publicKey) {
      addLog('error', 'WALLET NOT CONNECTED');
      return;
    }

    setIsExecuting(true);
    addLog('info', `EXECUTING ${cubes.length}-STEP COMBO VIA ROUTER CONTRACT`);

    try {
      // Build swap parameters for router execution
      const swapParams: SwapParams[] = cubes.map((cube, i) => ({
        inputMint: i === 0 ? cube.tokenIn!.mint : cubes[i - 1].tokenOut!.mint,
        outputMint: cube.tokenOut!.mint,
        amount: i === 0 ? cube.amountIn! : outputs[i - 1]?.amount || 0, // Use calculated output or input amount
        slippageBps: 50 // 0.5% slippage
      }));

      addLog('info', 'BUILDING COMBO TRANSACTION VIA ROUTER');
      addLog('info', 'DEVNET MODE - USING MOCK JUPITER DATA FOR TESTING');
      addLog('info', `STEP 1: ${cubes[0].tokenIn?.symbol} → ${cubes[0].tokenOut?.symbol}`);
      
      for (let i = 1; i < cubes.length; i++) {
        addLog('info', `STEP ${i + 1}: ${cubes[i - 1].tokenOut?.symbol} → ${cubes[i].tokenOut?.symbol}`);
      }

      // Execute combo swaps via router contract
      const signature = await executeComboSwaps(
        publicKey,
        swapParams,
        async (transaction) => {
          if (!window.solana) {
            throw new Error('Phantom wallet not found');
          }
          return await window.solana.signTransaction(transaction);
        }
      );

      addLog('success', `COMBO EXECUTED SUCCESSFULLY`);
      addLog('info', `TRANSACTION: ${signature}`);
      addLog('info', `VIEW ON EXPLORER: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
      
    } catch (error) {
      addLog('error', `EXECUTION FAILED: ${error instanceof Error ? error.message : 'UNKNOWN'}`);
      console.error('Combo execution error:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  const isValidCombo = cubes.length > 0 && cubes.every(
    (cube, i) => {
      if (i === 0) {
        return cube.dex && cube.tokenIn && cube.tokenOut && cube.amountIn;
      }
      return cube.dex && cube.tokenOut;
    }
  );

  const finalOutput = outputs[outputs.length - 1];
  const initialInput = cubes[0];
  const profitLoss = finalOutput && initialInput?.tokenIn && finalOutput.token.symbol === initialInput.tokenIn.symbol
    ? ((finalOutput.amount - (initialInput.amountIn || 0)) / (initialInput.amountIn || 1)) * 100
    : null;

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

   COMBO BUILDER // MULTI-STEP TRANSACTION EXECUTION
`}
          </pre>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="font-mono text-xs">
              <span className="text-white">NETWORK:</span>{' '}
              <span className="text-[#9333ea]">SOLANA-DEVNET</span>
              <span className="text-white ml-4">LATENCY:</span>{' '}
              <span className={networkLatency < 200 ? 'text-[#9333ea]' : networkLatency < 500 ? 'text-[#ffff00]' : 'text-[#ff0000]'}>
                {networkLatency}ms
              </span>
              <span className="text-white ml-4">STEPS:</span>{' '}
              <span className="text-[#ff9900]">{cubes.length}</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setCubes([]);
                  addLog('info', 'COMBO CLEARED');
                }}
                disabled={cubes.length === 0}
                className="border border-[#ff0000] px-4 py-2 text-[#ff0000] hover:bg-[#ff0000] hover:text-black disabled:opacity-30 transition-colors font-mono text-xs"
              >
                [CLEAR]
              </button>
              <button
                onClick={addCube}
                className="border border-[#9333ea] px-4 py-2 text-[#9333ea] hover:bg-[#9333ea] hover:text-black transition-colors font-mono text-xs"
              >
                [+ADD STEP]
              </button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_420px] gap-6">
          <div className="space-y-6">
            <div className="cyber-card p-6 bg-black/90 backdrop-blur-sm min-h-[600px]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-mono text-[#9333ea]">TRANSACTION CHAIN [{cubes.length}]</h2>
                <div className="text-xs font-mono text-white">
                  DRAG_TO_REORDER
                </div>
              </div>

              {cubes.length === 0 ? (
                <div className="flex items-center justify-center h-96 border-2 border-dashed border-gray-800">
                  <div className="text-center">
                    <p className="text-white font-mono text-lg mb-2">NO_STEPS_CONFIGURED</p>
                    <p className="text-gray-700 font-mono text-sm mb-6">BUILD YOUR MULTI-STEP TRANSACTION</p>
                    <button
                      onClick={addCube}
                      className="border border-[#9333ea] px-6 py-3 text-[#9333ea] hover:bg-[#9333ea] hover:text-black transition-colors font-mono text-sm"
                    >
                      [ADD FIRST STEP]
                    </button>
                  </div>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={cubes.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {cubes.map((cube, index) => (
                        <ActionCube
                          key={cube.id}
                          cube={cube}
                          index={index}
                          onUpdate={(updated) => updateCube(cube.id, updated)}
                          onRemove={() => removeCube(cube.id)}
                          previousOutput={index > 0 ? outputs[index - 1] : undefined}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {finalOutput && initialInput && (
                <div className="mt-6 cyber-card p-4 bg-black/80 border-[#ffff00]">
                  <h3 className="text-xs font-mono text-[#ffff00] mb-3">FINAL OUTPUT</h3>
                  <div className="font-mono text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-white">STARTING_WITH</span>
                      <span className="text-[#9333ea]">{initialInput.amountIn} {initialInput.tokenIn?.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white">ENDING_WITH</span>
                      <span className="text-[#ff9900]">{finalOutput.amount.toFixed(4)} {finalOutput.token.symbol}</span>
                    </div>
                    {profitLoss !== null && (
                      <div className="flex justify-between border-t border-gray-800 pt-2 mt-2">
                        <span className="text-white">PROFIT_LOSS</span>
                        <span className={profitLoss > 0 ? 'text-[#9333ea]' : 'text-[#ff0000]'}>
                          {profitLoss > 0 ? '+' : ''}{profitLoss.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="cyber-card p-4 bg-black/90 backdrop-blur-sm">
              <h3 className="text-sm font-mono text-[#9333ea] mb-3 border-b border-[#9333ea]/30 pb-2 flex items-center justify-between">
                <span>SYSTEM LOGS</span>
                <span className="text-white">[LIVE]</span>
              </h3>
              <div className="h-80 overflow-y-auto space-y-1 font-mono text-[10px] custom-scrollbar">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-gray-700">[{log.timestamp}]</span>
                    <span className={
                      log.type === 'success' ? 'text-[#9333ea]' :
                      log.type === 'error' ? 'text-[#ff0000]' :
                      log.type === 'quote' ? 'text-[#ff9900]' :
                      'text-white'
                    }>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>

            <div className="cyber-card p-6 bg-black/90 backdrop-blur-sm">
              <h3 className="text-sm font-mono text-[#ff9900] mb-4 border-b border-[#ff9900]/30 pb-2">
                EXECUTION STATUS
              </h3>
              <div className="space-y-3 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-white">STEPS_QUEUED</span>
                  <span className="text-[#9333ea]">{cubes.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white">VALID_CONFIG</span>
                  <span className={isValidCombo ? 'text-[#9333ea]' : 'text-[#ff0000]'}>
                    {isValidCombo ? '[YES]' : '[NO]'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white">EST_GAS</span>
                  <span className="text-gray-500">~{(cubes.length * 0.002).toFixed(3)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white">WALLET</span>
                  <span className={connected ? 'text-[#9333ea]' : 'text-[#ff0000]'}>
                    {connected ? '[CONNECTED]' : '[DISCONNECTED]'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white">SIMULATION</span>
                  <span className={isSimulating ? 'text-[#ffff00]' : 'text-[#9333ea]'}>
                    {isSimulating ? '[RUNNING]' : '[READY]'}
                  </span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <button
                  onClick={simulateCombo}
                  disabled={!isValidCombo || isSimulating || isExecuting}
                  className="w-full border border-[#9333ea] py-3 text-[#9333ea] hover:bg-[#9333ea] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-sm"
                >
                  {isSimulating ? '[SIMULATING...]' : '[SIMULATE ON MAINNET]'}
                </button>
                
                <button
                  onClick={executeCombo}
                  disabled={!isValidCombo || isExecuting || isSimulating}
                  className="w-full border border-[#ffff00] py-3 text-[#ffff00] hover:bg-[#ffff00] hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-sm"
                >
                  {isExecuting ? '[BUILDING TX...]' : connected ? '[EXECUTE ON DEVNET]' : '[CONNECT WALLET]'}
                </button>
              </div>
              {!connected && isValidCombo && (
                <div className="mt-2 text-xs font-mono text-white text-center">
                  DEVNET EXECUTION - CONNECT WALLET TO TEST CONTRACTS
                </div>
              )}
            </div>

            <div className="cyber-card p-4 bg-black/90 backdrop-blur-sm">
              <h3 className="text-xs font-mono text-[#ffff00] mb-3 border-b border-[#ffff00]/30 pb-2">
                SYSTEM CONFIG
              </h3>
              <div className="space-y-2 font-mono text-xs text-white">
                <p>▸ PROTOCOL: JUPITER_V6_AGGREGATOR</p>
                <p>▸ DEXES: ORCA // RAYDIUM // METEORA</p>
                <p>▸ MAX_STEPS: UNLIMITED</p>
                <p>▸ SLIPPAGE: AUTO_CALCULATED_PER_STEP</p>
                <p>▸ EXECUTION: SINGLE_ATOMIC_TX</p>
                <p>▸ AUTO_CHAINING: ENABLED</p>
                <p>▸ PRICE_IMPACT: MONITORED</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
