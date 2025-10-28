const SCANNER_API_BASE = process.env.NEXT_PUBLIC_SCANNER_API_URL || 'http://localhost:3002';

export interface ScannerConfig {
  scanInterval?: number;
  minProfitUSD?: number;
  minProfitPercentage?: number;
}

export interface ScannerStatus {
  isRunning: boolean;
  scanCount?: number;
  totalScans?: number;
  lastScanTime?: string;
  startTime?: string;
  uptime?: number;
  lastScanAgo?: number;
  lastOpportunities?: any[];
  config?: ScannerConfig;
}

export interface ScannerOpportunity {
  id: string;
  profitUSD: number;
  profitPercentage: number;
  inputToken: string;
  outputToken: string;
  route: any[];
  timestamp: string;
}

export class ScannerAPI {
  private static instance: ScannerAPI;
  private ws: WebSocket | null = null;

  static getInstance(): ScannerAPI {
    if (!ScannerAPI.instance) {
      ScannerAPI.instance = new ScannerAPI();
    }
    return ScannerAPI.instance;
  }

  async startScanner(config: ScannerConfig = {}): Promise<boolean> {
    try {
      const response = await fetch(`${SCANNER_API_BASE}/api/scanner/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanInterval: config.scanInterval || 30000,
          minProfitUSD: config.minProfitUSD || 5.0,
          minProfitPercentage: config.minProfitPercentage || 0.5,
          ...config
        })
      });

      if (!response.ok) {
        throw new Error(`Scanner start failed: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Failed to start scanner:', error);
      throw error;
    }
  }

  async stopScanner(): Promise<boolean> {
    try {
      const response = await fetch(`${SCANNER_API_BASE}/api/scanner/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Scanner stop failed: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Failed to stop scanner:', error);
      throw error;
    }
  }

  async getStatus(): Promise<any> {
    try {
      const response = await fetch(`${SCANNER_API_BASE}/api/scanner/status`);
      
      if (!response.ok) {
        throw new Error(`Failed to get scanner status: ${response.statusText}`);
      }

      const data = await response.json();
      // Return the full response, including nested status and opportunities
      return data;
    } catch (error) {
      console.error('Failed to get scanner status:', error);
      throw error;
    }
  }

  async getOpportunities(): Promise<any> {
    try {
      const response = await fetch(`${SCANNER_API_BASE}/api/scanner/opportunities`);
      
      if (!response.ok) {
        throw new Error(`Failed to get opportunities: ${response.statusText}`);
      }

      const data = await response.json();
      // Return the full response including metadata
      return data;
    } catch (error) {
      console.error('Failed to get opportunities:', error);
      throw error;
    }
  }

  async getConfig(): Promise<ScannerConfig> {
    try {
      const response = await fetch(`${SCANNER_API_BASE}/api/scanner/config`);
      
      if (!response.ok) {
        throw new Error(`Failed to get config: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get config:', error);
      throw error;
    }
  }

  async manualScan(): Promise<ScannerOpportunity[]> {
    try {
      const response = await fetch(`${SCANNER_API_BASE}/api/scanner/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`Manual scan failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to perform manual scan:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${SCANNER_API_BASE}/health`);
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  connectWebSocket(
    onMessage: (data: any) => void,
    onError?: (error: Event) => void,
    onClose?: () => void
  ): void {
    try {
      const wsUrl = (process.env.NEXT_PUBLIC_SCANNER_API_URL || 'http://localhost:3002').replace(/^http/, 'ws');
      this.ws = new WebSocket(`${wsUrl}/ws/scanner`);

      this.ws.onopen = () => {
        console.log('Scanner WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('Scanner WebSocket error:', error);
        if (onError) onError(error);
      };

      this.ws.onclose = () => {
        console.log('Scanner WebSocket disconnected');
        if (onClose) onClose();
      };

    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      if (onError) onError(error as Event);
    }
  }

  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isWebSocketConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const scannerAPI = ScannerAPI.getInstance();