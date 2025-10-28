import { useState, useEffect } from 'react';
import { findArbitrageOpportunities } from '@/lib/jupiter';
import { COMMON_TOKENS } from '@/lib/constants';
import { ArbitrageOpportunity } from '@/types';
import { generateId } from '@/lib/utils';

export function useArbitrage(minProfit: number = -100, enabled: boolean = true) {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const scanOpportunities = async () => {
    if (!enabled) return;

    try {
      setLoading(true);
      const foundOpportunities = await findArbitrageOpportunities(COMMON_TOKENS, -100);

      const opportunities = foundOpportunities
        .map(op => ({ ...op, id: generateId() }))
        .filter(op => op.estimatedProfit >= minProfit);

      setOpportunities(opportunities);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;

    scanOpportunities();

    const interval = setInterval(scanOpportunities, 30000);

    return () => clearInterval(interval);
  }, [minProfit, enabled]);

  return {
    opportunities,
    loading,
    error,
    refresh: scanOpportunities,
  };
}
