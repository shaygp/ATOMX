'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import StakingMetrics from '@/components/StakingMetrics';

export default function Home() {
  const router = useRouter();
  const { connected, publicKey } = useWallet();
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([
    '> ATOMX DEFI PROTOCOL',
    '> SOLANA NETWORK [DEVNET]',
    '> JUPITER V6 AGGREGATOR [ONLINE]',
    connected ? `> WALLET CONNECTED [${publicKey?.toString().slice(0, 8)}...]` : '> WALLET [DISCONNECTED]',
    '> ',
    '> TYPE "help" FOR COMMANDS',
  ]);

  // Update history when wallet connection changes
  useEffect(() => {
    setHistory([
      '> ATOMX DEFI PROTOCOL',
      '> SOLANA NETWORK [DEVNET]',
      '> JUPITER V6 AGGREGATOR [ONLINE]',
      connected ? `> WALLET CONNECTED [${publicKey?.toString().slice(0, 8)}...]` : '> WALLET [DISCONNECTED]',
      '> ',
      '> TYPE "help" FOR COMMANDS',
    ]);
  }, [connected, publicKey]);

  const handleCommand = (cmd: string) => {
    const lower = cmd.toLowerCase().trim();

    if (lower === 'help') {
      setHistory([...history, `> ${cmd}`, 'AVAILABLE COMMANDS:', '  combo     - Multi-DEX swap builder', '  arbitrage - Live opportunity scanner', '  vault     - Liquidity pool', '  clear     - Clear terminal', '']);
    } else if (lower === 'combo') {
      router.push('/combo');
    } else if (lower === 'arbitrage') {
      router.push('/arbitrage');
    } else if (lower === 'vault') {
      router.push('/vault');
    } else if (lower === 'clear') {
      setHistory(['']);
    } else if (cmd) {
      setHistory([...history, `> ${cmd}`, `ERROR: UNKNOWN COMMAND "${cmd}"`, 'TYPE "help" FOR COMMANDS', '']);
    }
    setCommand('');
  };

  return (
    <div className="min-h-screen p-6 flex items-center justify-center">
      <div className="max-w-6xl w-full">
        <StakingMetrics />
        <div className="cyber-card p-6">
          <div className="font-mono text-sm">
            {history.map((line, i) => (
              <div key={i} className={line.startsWith('>') ? 'text-white' : 'text-gray-500'}>
                {line}
              </div>
            ))}
            <div className="flex items-center gap-2 text-[#9333ea]">
              <span>&gt;</span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCommand(command);
                  }
                }}
                className="flex-1 bg-transparent outline-none border-none text-[#9333ea]"
                autoFocus
              />
              <span className="animate-pulse">█</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
