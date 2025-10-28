import { useState, useEffect } from 'react';
import { stakingAPI } from '@/lib/staking-facilities';

export interface StakingStats {
  epoch: number;
  slot: number;
  blockHeight: number;
  transactionCount: number;
  totalValidators: number;
  activeValidators: number;
  delinquentValidators: number;
  totalStake: number;
  totalActiveStake: number;
  totalDelinquentStake: number;
  averageCommission: number;
  networkHealth: string;
}

export function useStakingData() {
  const [data, setData] = useState<StakingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchStakingData() {
      try {
        setLoading(true);
        setError(null);
        const stats = await stakingAPI.getStakingStats();
        if (mounted) {
          setData(stats);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch staking data');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchStakingData();

    // Refresh data every 30 seconds
    const interval = setInterval(fetchStakingData, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { data, loading, error };
}