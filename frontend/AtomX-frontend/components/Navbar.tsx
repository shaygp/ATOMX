'use client';

import Link from 'next/link';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { useState } from 'react';

export default function Navbar() {
  const { 
    publicKey, 
    connected, 
    connecting, 
    error, 
    balance,
    loadingBalance,
    connect, 
    disconnect, 
    isPhantomInstalled 
  } = usePhantomWallet();
  
  const [showError, setShowError] = useState(false);

  const handleWalletAction = async () => {
    if (connected) {
      await disconnect();
    } else {
      if (!isPhantomInstalled) {
        window.open('https://phantom.app/', '_blank');
        return;
      }
      await connect();
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // Show error temporarily
  if (error && !showError) {
    setShowError(true);
    setTimeout(() => setShowError(false), 5000);
  }

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#9333ea] bg-black">
        <div className="container mx-auto px-6 py-2">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <span className="text-sm font-bold font-mono text-[#9333ea]">
                ATOMX://
              </span>
            </Link>

            <div className="flex items-center gap-6 font-mono text-xs">
              <Link
                href="/combo"
                className="text-gray-500 hover:text-[#9333ea] transition-colors"
              >
                [COMBO]
              </Link>
              <Link
                href="/arbitrage"
                className="text-gray-500 hover:text-[#9333ea] transition-colors"
              >
                [ARBI]
              </Link>
              <Link
                href="/vault"
                className="text-gray-500 hover:text-[#9333ea] transition-colors"
              >
                [VAULT]
              </Link>
              
              {/* Network indicator */}
              <div className="text-gray-400 text-[10px]">
                DEVNET
              </div>
              
              {/* Balance display */}
              {connected && (
                <div className="text-[#ffff00] font-mono text-xs">
                  {loadingBalance ? '...' : balance !== null ? `${balance.toFixed(4)} SOL` : '0.0000 SOL'}
                </div>
              )}
              
              {/* Wallet connection button */}
              <button 
                onClick={handleWalletAction}
                disabled={connecting}
                className={`border px-3 py-1 transition-colors ${
                  connected 
                    ? 'border-[#00ff00] text-[#00ff00] hover:bg-[#00ff00] hover:text-black'
                    : isPhantomInstalled
                    ? 'border-[#9333ea] text-[#9333ea] hover:bg-[#9333ea] hover:text-black'
                    : 'border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black'
                } ${connecting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {connecting ? '[CONNECTING...]' : 
                 connected ? `[${formatAddress(publicKey?.toString() || '')}]` :
                 isPhantomInstalled ? '[CONNECT]' : '[INSTALL PHANTOM]'
                }
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Error notification */}
      {showError && error && (
        <div className="fixed top-16 right-4 z-50 bg-black border border-[#ff0000] p-3 max-w-sm">
          <div className="text-[#ff0000] font-mono text-xs">
            WALLET ERROR: {error}
          </div>
          <button 
            onClick={() => setShowError(false)}
            className="text-gray-500 hover:text-white text-[10px] mt-1"
          >
            [DISMISS]
          </button>
        </div>
      )}
    </>
  );
}
