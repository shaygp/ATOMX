'use client';

import { ArbitrageOpportunity } from '@/types';
import { formatNumber, cn } from '@/lib/utils';
import { useState } from 'react';

interface ArbitrageCardProps {
  opportunity: ArbitrageOpportunity;
  onExecute: (opportunity: ArbitrageOpportunity) => void;
  connected?: boolean;
}

const DEX_COLORS: Record<string, string> = {
  orca: '#9333ea',
  raydium: '#ff9900',
  meteora: '#ff0000',
  jupiter: '#ffff00',
};

export default function ArbitrageCard({ opportunity, onExecute, connected = false }: ArbitrageCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isProfitable = opportunity.profitPercentage > 0.5;
  const timeSince = Math.floor((Date.now() - opportunity.timestamp) / 1000);
  const estimatedGas = 0.000005 * opportunity.path.length * 150;
  const netProfit = opportunity.estimatedProfit - estimatedGas;
  const slippage = 0.5;
  const priceImpact = Math.random() * 0.3;

  return (
    <div className={cn(
      "cyber-card p-4 transition-all duration-200",
      expanded && "border-[#9333ea]"
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-white">PROFIT</span>
              <span className="text-xl font-bold font-mono text-[#ffff00]">
                ${opportunity.estimatedProfit.toFixed(4)}
              </span>
            </div>
            <div className={cn(
              "px-2 py-0.5 text-xs font-mono border",
              isProfitable ? 'border-[#9333ea] text-[#9333ea]' : 'border-gray-600 text-white'
            )}>
              +{opportunity.profitPercentage.toFixed(2)}%
            </div>
            <div className="px-2 py-0.5 text-xs font-mono border border-[#ff9900] text-[#ff9900]">
              {opportunity.path.length}H
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono text-white">
            <span>ID: {opportunity.id.substring(0, 12)}</span>
            <span>AGE: {timeSince}s</span>
            <span>GAS: ${estimatedGas.toFixed(4)}</span>
            <span>NET: ${netProfit.toFixed(4)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-3 py-1 font-mono text-xs border border-gray-600 text-white hover:border-[#9333ea] hover:text-[#9333ea] transition-colors"
          >
            {expanded ? '[HIDE]' : '[INFO]'}
          </button>
          <button
            onClick={() => onExecute(opportunity)}
            disabled={!isProfitable}
            className={cn(
              "px-3 py-1 font-mono text-xs border transition-colors",
              isProfitable
                ? "border-[#ffff00] text-[#ffff00] hover:bg-[#ffff00] hover:text-black"
                : "border-gray-700 text-white cursor-not-allowed opacity-50"
            )}
          >
            [EXEC]
          </button>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {opportunity.path.map((step, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center border border-gray-800 font-mono text-xs text-white">
              {index + 1}
            </div>
            <div
              className="px-2 py-1 font-mono text-[10px] border-2 flex-shrink-0"
              style={{
                borderColor: DEX_COLORS[step.dex],
                color: DEX_COLORS[step.dex],
              }}
            >
              {step.dex.toUpperCase()}
            </div>
            <div className="flex-1 flex items-center gap-2 font-mono text-sm">
              <span className="text-[#9333ea] font-bold">{step.from.symbol}</span>
              <span className="text-gray-700">━━▸</span>
              <span className="text-[#ff9900] font-bold">{step.to.symbol}</span>
            </div>
            <div className="text-xs font-mono text-white">
              {formatNumber(step.expectedOutput, 6)}
            </div>
          </div>
        ))}
      </div>

      {expanded && (
        <div className="pt-4 mt-4 border-t border-gray-800 space-y-3 animate-fadeIn">
          <div className="grid grid-cols-2 gap-4 font-mono text-xs">
            <div className="space-y-2">
              <div className="text-white text-[10px]">EXECUTION DETAILS</div>
              <div className="flex justify-between">
                <span className="text-white">REQUIRED_CAPITAL</span>
                <span className="text-[#9333ea]">${opportunity.requiredAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white">EST_GAS_COST</span>
                <span className="text-[#ff9900]">${estimatedGas.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white">NET_PROFIT</span>
                <span className="text-[#ffff00]">${netProfit.toFixed(4)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-white text-[10px]">RISK METRICS</div>
              <div className="flex justify-between">
                <span className="text-white">SLIPPAGE_TOL</span>
                <span className="text-[#9333ea]">{slippage}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white">PRICE_IMPACT</span>
                <span className={priceImpact < 0.1 ? 'text-[#9333ea]' : priceImpact < 0.2 ? 'text-[#ffff00]' : 'text-[#ff0000]'}>
                  {priceImpact.toFixed(3)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white">ROUTE_HOPS</span>
                <span className="text-[#9333ea]">{opportunity.path.length}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-800">
            <div className="text-white text-[10px] mb-2">SWAP ROUTE</div>
            <div className="font-mono text-[10px] text-white space-y-1">
              {opportunity.path.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-gray-700">[{i + 1}]</span>
                  <span className="text-[#9333ea]">{step.from.symbol}</span>
                  <span className="text-gray-700">→</span>
                  <span className="text-[#ff9900]">{step.to.symbol}</span>
                  <span className="text-gray-700">@</span>
                  <span className="text-[#ffff00]">{step.dex.toUpperCase()}</span>
                  <span className="text-gray-800 ml-auto">{step.pool.substring(0, 8)}...</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-gray-800 flex items-center justify-between">
            <div className="text-[10px] font-mono text-gray-700">
              READY_FOR_EXECUTION • {connected ? 'WALLET_CONNECTED' : 'CONNECT_WALLET_REQUIRED'}
            </div>
            <div className="text-[10px] font-mono">
              <span className="text-white">ROI:</span>{' '}
              <span className="text-[#ffff00]">{((netProfit / opportunity.requiredAmount) * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="pt-3 border-t border-gray-800 grid grid-cols-3 gap-4 font-mono text-xs">
        <div>
          <div className="text-white text-[10px]">INPUT</div>
          <div className="text-[#9333ea]">${opportunity.requiredAmount.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-white text-[10px]">OUTPUT</div>
          <div className="text-[#ffff00]">${(opportunity.requiredAmount + netProfit).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-white text-[10px]">CONFIDENCE</div>
          <div className={isProfitable ? 'text-[#9333ea]' : 'text-[#ff0000]'}>
            {isProfitable ? 'HIGH' : 'LOW'}
          </div>
        </div>
      </div>
    </div>
  );
}
