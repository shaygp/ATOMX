import { useState, useEffect } from 'react';
import { getTokenPrices, TokenPrice } from '@/lib/jupiter';

export function useJupiterPrice(tokenMints: string[]) {
  const [prices, setPrices] = useState<Record<string, TokenPrice>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (tokenMints.length === 0) {
      setLoading(false);
      return;
    }

    const fetchPrices = async () => {
      try {
        setLoading(true);
        const priceData = await getTokenPrices(tokenMints);
        setPrices(priceData);
        setError(null);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();

    // Refresh prices every 30 seconds
    const interval = setInterval(fetchPrices, 30000);

    return () => clearInterval(interval);
  }, [tokenMints.join(',')]);

  return { prices, loading, error };
}
