import { useState, useEffect, useCallback, useRef } from 'react';
import { scannerAPI, ScannerConfig, ScannerStatus, ScannerOpportunity } from '@/lib/scanner-api';

export interface UseScanner {
  isRunning: boolean;
  loading: boolean;
  error: string | null;
  opportunities: ScannerOpportunity[];
  opportunitiesData: any; // Full opportunities response
  status: ScannerStatus | null;
  fullStatus: any; // Full status response
  connected: boolean;
  startScanner: (config?: ScannerConfig) => Promise<void>;
  stopScanner: () => Promise<void>;
  manualScan: () => Promise<void>;
  getStatus: () => Promise<void>;
  clearError: () => void;
}

export function useScanner(
  onLogMessage?: (log: any) => void,
  onOpportunityMessage?: (opportunity: any) => void
): UseScanner {
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<ScannerOpportunity[]>([]);
  const [opportunitiesData, setOpportunitiesData] = useState<any>(null);
  const [status, setStatus] = useState<ScannerStatus | null>(null);
  const [fullStatus, setFullStatus] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const wsConnectedRef = useRef(false);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getStatus = useCallback(async () => {
    try {
      const fullStatusData = await scannerAPI.getStatus();
      setFullStatus(fullStatusData);
      
      // Extract the nested status object
      const statusData = fullStatusData.status || fullStatusData;
      setStatus(statusData);
      setIsRunning(statusData.isRunning);
      
      // Also extract opportunities from the status response if available
      if (fullStatusData.opportunities) {
        setOpportunities(fullStatusData.opportunities);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get scanner status');
    }
  }, []);

  const startScanner = useCallback(async (config?: ScannerConfig) => {
    try {
      setLoading(true);
      setError(null);
      
      await scannerAPI.startScanner(config);
      setIsRunning(true);
      
      // Get updated status
      await getStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scanner');
      setIsRunning(false);
    } finally {
      setLoading(false);
    }
  }, [getStatus]);

  const stopScanner = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      await scannerAPI.stopScanner();
      setIsRunning(false);
      
      // Get updated status
      await getStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop scanner');
    } finally {
      setLoading(false);
    }
  }, [getStatus]);

  const manualScan = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const results = await scannerAPI.manualScan();
      setOpportunities(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to perform manual scan');
    } finally {
      setLoading(false);
    }
  }, []);

  // Check health and initial status
  useEffect(() => {
    const checkHealth = async () => {
      try {
        console.log('Checking scanner API health...');
        const healthy = await scannerAPI.healthCheck();
        console.log('Scanner API health status:', healthy);
        setConnected(healthy);
        
        if (healthy) {
          console.log('Getting scanner status...');
          await getStatus();
          
          // Also get initial opportunities
          try {
            const oppsData = await scannerAPI.getOpportunities();
            console.log('Initial opportunities data:', oppsData);
            setOpportunitiesData(oppsData);
            
            // Extract opportunities array from the response
            const opps = oppsData.opportunities || oppsData;
            setOpportunities(Array.isArray(opps) ? opps : []);
            console.log('Parsed opportunities:', opps.length);
          } catch (err) {
            console.warn('Failed to get initial opportunities:', err);
          }
        }
      } catch (err) {
        console.error('Scanner health check failed:', err);
        setConnected(false);
        const apiUrl = process.env.NEXT_PUBLIC_SCANNER_API_URL || 'localhost:3002';
        setError(`Scanner API is not available at ${apiUrl}`);
      }
    };

    checkHealth();
    
    // Check health periodically
    const healthInterval = setInterval(checkHealth, 10000);
    
    return () => clearInterval(healthInterval);
  }, [getStatus]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!connected || wsConnectedRef.current) return;

    const handleWebSocketMessage = (data: any) => {
      switch (data.type) {
        case 'log':
          // Handle log messages - these will be processed by the parent component
          if (onLogMessage) {
            onLogMessage(data.data);
          }
          break;
        case 'opportunities':
          setOpportunities(data.data || []);
          break;
        case 'opportunity':
          // Handle single opportunity updates
          if (data.data && onOpportunityMessage) {
            onOpportunityMessage(data.data);
          }
          break;
        case 'status':
          setStatus(data.data);
          setIsRunning(data.data?.isRunning || false);
          break;
        case 'scan_complete':
          // Refresh opportunities after scan
          scannerAPI.getOpportunities().then(setOpportunities).catch(console.error);
          break;
        case 'error':
          setError(data.message || 'Scanner error occurred');
          break;
        default:
          console.log('Unknown WebSocket message type:', data.type, data);
      }
    };

    const handleWebSocketError = (error: Event) => {
      console.error('Scanner WebSocket error:', error);
      setError('WebSocket connection error');
      wsConnectedRef.current = false;
    };

    const handleWebSocketClose = () => {
      console.log('Scanner WebSocket closed');
      wsConnectedRef.current = false;
      
      // Try to reconnect after 5 seconds
      setTimeout(() => {
        if (connected) {
          scannerAPI.connectWebSocket(handleWebSocketMessage, handleWebSocketError, handleWebSocketClose);
        }
      }, 5000);
    };

    scannerAPI.connectWebSocket(handleWebSocketMessage, handleWebSocketError, handleWebSocketClose);
    wsConnectedRef.current = true;

    return () => {
      scannerAPI.disconnectWebSocket();
      wsConnectedRef.current = false;
    };
  }, [connected, onLogMessage, onOpportunityMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      scannerAPI.disconnectWebSocket();
    };
  }, []);

  return {
    isRunning,
    loading,
    error,
    opportunities,
    opportunitiesData,
    status,
    fullStatus,
    connected,
    startScanner,
    stopScanner,
    manualScan,
    getStatus,
    clearError
  };
}