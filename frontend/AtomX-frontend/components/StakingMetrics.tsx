'use client';

import { useStakingData } from '@/hooks/useStakingData';

export default function StakingMetrics() {
  const { data, loading, error } = useStakingData();

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="cyber-card p-4 animate-pulse">
            <div className="h-4 bg-gray-600 rounded mb-2"></div>
            <div className="h-6 bg-gray-700 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="cyber-card p-4 mb-6 border-red-500/50">
        <p className="text-red-400 text-sm">Failed to load staking data: {error}</p>
      </div>
    );
  }

  if (!data) return null;

  const formatNumber = (num: number, decimals = 0) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  const formatLargeNumber = (num: number) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return formatNumber(num);
  };

  return (
    <div className="mb-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-mono text-[#9333ea] mb-2">SOLANA NETWORK METRICS</h3>
        <div className="text-xs text-gray-400">
          EPOCH {data.epoch} • SLOT {formatLargeNumber(data.slot)} • {data.networkHealth.toUpperCase()}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Developed with Staking Facilities API
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="cyber-card p-4">
          <div className="text-xs text-gray-400 mb-1">VALIDATORS</div>
          <div className="text-lg font-mono text-white">{formatNumber(data.totalValidators)}</div>
          <div className="text-xs text-green-400">{formatNumber(data.activeValidators)} ACTIVE</div>
        </div>

        <div className="cyber-card p-4">
          <div className="text-xs text-gray-400 mb-1">TOTAL STAKE</div>
          <div className="text-lg font-mono text-white">{formatLargeNumber(data.totalStake)}</div>
          <div className="text-xs text-blue-400">SOL</div>
        </div>

        <div className="cyber-card p-4">
          <div className="text-xs text-gray-400 mb-1">AVG COMMISSION</div>
          <div className="text-lg font-mono text-white">{data.averageCommission}%</div>
          <div className="text-xs text-yellow-400">NETWORK AVG</div>
        </div>

        <div className="cyber-card p-4">
          <div className="text-xs text-gray-400 mb-1">TRANSACTIONS</div>
          <div className="text-lg font-mono text-white">{formatLargeNumber(data.transactionCount)}</div>
          <div className="text-xs text-purple-400">TOTAL</div>
        </div>

        <div className="cyber-card p-4">
          <div className="text-xs text-gray-400 mb-1">BLOCK HEIGHT</div>
          <div className="text-lg font-mono text-white">{formatLargeNumber(data.blockHeight)}</div>
          <div className="text-xs text-cyan-400">CURRENT</div>
        </div>

        <div className="cyber-card p-4">
          <div className="text-xs text-gray-400 mb-1">ACTIVE STAKE</div>
          <div className="text-lg font-mono text-white">{formatLargeNumber(data.totalActiveStake)}</div>
          <div className="text-xs text-green-400">SOL</div>
        </div>

        <div className="cyber-card p-4">
          <div className="text-xs text-gray-400 mb-1">DELINQUENT</div>
          <div className="text-lg font-mono text-white">{formatNumber(data.delinquentValidators)}</div>
          <div className="text-xs text-red-400">VALIDATORS</div>
        </div>

        <div className="cyber-card p-4">
          <div className="text-xs text-gray-400 mb-1">NETWORK</div>
          <div className="text-lg font-mono text-white">{data.networkHealth}</div>
          <div className={`text-xs ${data.networkHealth === 'Healthy' ? 'text-green-400' : 'text-yellow-400'}`}>
            STATUS
          </div>
        </div>
      </div>
    </div>
  );
}