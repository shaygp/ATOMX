'use client';

import { SwapCube as SwapCubeType, DexType } from '@/types';
import { COMMON_TOKENS } from '@/lib/constants';
import { cn, formatNumber } from '@/lib/utils';
import { useJupiterPrice } from '@/hooks/useJupiterPrice';
import { useEffect, useState } from 'react';
import { getJupiterQuote } from '@/lib/jupiter';

interface SwapCubeProps {
  cube: SwapCubeType;
  onUpdate: (cube: SwapCubeType) => void;
  onRemove: () => void;
  isDragging?: boolean;
}

export default function SwapCube({ cube, onUpdate, onRemove, isDragging }: SwapCubeProps) {
  const dexes: { id: DexType; label: string; color: string }[] = [
    { id: 'orca', label: 'ORCA', color: '#9333ea' },
    { id: 'raydium', label: 'RAYDIUM', color: '#ff9900' },
    { id: 'meteora', label: 'METEORA', color: '#ff0000' },
    { id: 'jupiter', label: 'JUPITER', color: '#ffff00' },
  ];
  const [estimatedOutput, setEstimatedOutput] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const tokenMints = [cube.tokenIn?.mint, cube.tokenOut?.mint].filter(Boolean) as string[];
  const { prices } = useJupiterPrice(tokenMints);

  // Fetch quote when all parameters are set
  useEffect(() => {
    if (!cube.tokenIn || !cube.tokenOut || !cube.amountIn) {
      setEstimatedOutput(null);
      return;
    }

    const fetchQuote = async () => {
      setLoading(true);
      try {
        const amountInLamports = Math.floor(
          (cube.amountIn || 0) * Math.pow(10, cube.tokenIn!.decimals)
        );
        const quote = await getJupiterQuote(
          cube.tokenIn!.mint,
          cube.tokenOut!.mint,
          amountInLamports
        );

        if (quote) {
          const output = parseInt(quote.outAmount) / Math.pow(10, cube.tokenOut!.decimals);
          setEstimatedOutput(output);
        }
      } catch (error) {
        console.error('Error fetching quote:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchQuote, 500);
    return () => clearTimeout(debounce);
  }, [cube.tokenIn, cube.tokenOut, cube.amountIn]);

  return (
    <div
      className={cn(
        'cyber-card p-4 relative',
        isDragging && 'opacity-50'
      )}
    >
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 text-white hover:text-[#ff0000] transition-colors font-mono text-xs"
      >
        [X]
      </button>

      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          {dexes.map((dex) => (
            <button
              key={dex.id}
              onClick={() => onUpdate({ ...cube, dex: dex.id })}
              className={cn(
                'px-3 py-1 font-mono text-xs transition-colors border',
                cube.dex === dex.id
                  ? 'border-current'
                  : 'border-gray-700 text-white hover:border-gray-500'
              )}
              style={{
                color: cube.dex === dex.id ? dex.color : undefined,
              }}
            >
              {dex.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white font-mono mb-1 block">FROM</label>
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
          </div>

          <div>
            <label className="text-xs text-white font-mono mb-1 block">AMOUNT</label>
            <input
              type="number"
              value={cube.amountIn || ''}
              onChange={(e) => onUpdate({ ...cube, amountIn: parseFloat(e.target.value) })}
              placeholder="0.00"
              className="w-full bg-black border border-[#9333ea]/30 px-3 py-2 text-[#9333ea] font-mono text-sm focus:outline-none focus:border-[#9333ea]"
            />
          </div>
        </div>

        <div className="flex justify-center">
          <div className="font-mono text-xs text-white">↓</div>
        </div>

        <div>
          <label className="text-xs text-white font-mono mb-1 block">TO</label>
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
          {estimatedOutput !== null && (
            <div className="text-xs text-white font-mono mt-2">
              EST_OUTPUT: {formatNumber(estimatedOutput, 4)} {cube.tokenOut?.symbol}
            </div>
          )}
          {loading && (
            <div className="text-xs text-white font-mono mt-2">FETCHING_QUOTE...</div>
          )}
        </div>
      </div>
    </div>
  );
}
