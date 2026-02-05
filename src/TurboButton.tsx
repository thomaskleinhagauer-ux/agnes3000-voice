// ================================
// TURBO Button Component
// Zeigt Kosten an und ermöglicht 200K Token Modus
// ================================

import { useState, useEffect } from 'react';
import { Zap, DollarSign, Info } from 'lucide-react';
import { calculateCost, fetchCurrentPricing, RATE_LIMITS, DEFAULT_TOKEN_LIMIT, TURBO_TOKEN_LIMIT } from './archivar';

interface TurboButtonProps {
  turboEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  documentCount: number;
  totalTokens: number;
  apiTier?: keyof typeof RATE_LIMITS;
}

export function TurboButton({
  turboEnabled,
  onToggle,
  documentCount,
  totalTokens,
  apiTier = 'tier1'
}: TurboButtonProps) {
  const [showCostInfo, setShowCostInfo] = useState(false);
  const [pricingInfo, setPricingInfo] = useState<string>('');

  useEffect(() => {
    fetchCurrentPricing().then(setPricingInfo);
  }, []);

  const currentLimit = turboEnabled ? TURBO_TOKEN_LIMIT : DEFAULT_TOKEN_LIMIT;
  const standardCost = calculateCost(DEFAULT_TOKEN_LIMIT, false);
  const turboCost = calculateCost(TURBO_TOKEN_LIMIT, true);

  const canUseTurbo = apiTier !== 'tier1'; // Tier 2+ can use TURBO

  return (
    <div className="relative">
      {/* TURBO Button */}
      <button
        onClick={() => canUseTurbo && onToggle(!turboEnabled)}
        disabled={!canUseTurbo}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-all
          ${turboEnabled
            ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg shadow-orange-500/30 animate-pulse'
            : canUseTurbo
              ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              : 'bg-gray-50 text-gray-400 cursor-not-allowed'
          }
        `}
        title={canUseTurbo ? 'TURBO aktivieren für 200K Token Kontext' : 'TURBO benötigt API Tier 2+'}
      >
        <Zap size={18} className={turboEnabled ? 'fill-current' : ''} />
        <span className="text-sm">TURBO</span>
        {turboEnabled && <span className="text-xs opacity-75">ON</span>}
      </button>

      {/* Cost Info Toggle */}
      <button
        onClick={() => setShowCostInfo(!showCostInfo)}
        className="ml-2 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
        title="Kosten-Info anzeigen"
      >
        <DollarSign size={16} />
      </button>

      {/* Cost Info Popup */}
      {showCostInfo && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Info size={16} />
              Kosten-Info
            </h3>
            <button
              onClick={() => setShowCostInfo(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>

          <div className="space-y-3 text-sm">
            {/* Current Status */}
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="font-medium text-amber-800 mb-1">Aktueller Modus</div>
              <div className="text-amber-600">
                {turboEnabled ? '🚀 TURBO' : '📦 Standard'}: {currentLimit.toLocaleString()} Tokens max
              </div>
              <div className="text-amber-500 text-xs mt-1">
                {documentCount} Dokumente | ~{totalTokens.toLocaleString()} Tokens geladen
              </div>
            </div>

            {/* Cost Comparison */}
            <div className="grid grid-cols-2 gap-2">
              <div className={`p-2 rounded-lg ${!turboEnabled ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
                <div className="text-xs text-gray-500">Standard</div>
                <div className="font-mono text-sm">${standardCost.totalCostUSD.toFixed(3)}</div>
                <div className="text-xs text-gray-400">~35K tokens</div>
              </div>
              <div className={`p-2 rounded-lg ${turboEnabled ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'}`}>
                <div className="text-xs text-gray-500">TURBO</div>
                <div className="font-mono text-sm">${turboCost.totalCostUSD.toFixed(3)}</div>
                <div className="text-xs text-gray-400">~150K tokens</div>
              </div>
            </div>

            {/* Cache Info */}
            <div className="bg-green-50 rounded-lg p-3">
              <div className="font-medium text-green-800 mb-1">💾 Mit Cache (nach 1. Nachricht)</div>
              <div className="text-green-600 text-sm">
                90% günstiger! Cache-Read statt Input-Tokens
              </div>
            </div>

            {/* API Tier Info */}
            <div className="border-t pt-2 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Dein API-Tier:</span>
                <span className="font-medium">{RATE_LIMITS[apiTier].name}</span>
              </div>
              <div className="flex justify-between">
                <span>Rate Limit:</span>
                <span className="font-medium">{RATE_LIMITS[apiTier].tokensPerMinute.toLocaleString()} tokens/min</span>
              </div>
            </div>

            {!canUseTurbo && (
              <div className="bg-red-50 text-red-700 rounded-lg p-2 text-xs">
                ⚠️ TURBO benötigt API Tier 2+ ($40+ Credits bei Anthropic)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ================================
// Cost Display for Room Entry
// ================================

interface CostDisplayProps {
  totalTokens: number;
  documentCount: number;
  isFirstMessage: boolean;
}

export function CostDisplay({ totalTokens, documentCount, isFirstMessage }: CostDisplayProps) {
  const cost = calculateCost(totalTokens, false, !isFirstMessage);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-full px-3 py-1">
      <DollarSign size={12} />
      <span>
        ~${cost.totalCostUSD.toFixed(3)} pro Nachricht
        {!isFirstMessage && <span className="text-green-600 ml-1">(cached)</span>}
      </span>
      <span className="text-gray-400">|</span>
      <span>{totalTokens.toLocaleString()} tokens</span>
    </div>
  );
}
