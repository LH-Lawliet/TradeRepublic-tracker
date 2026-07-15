import { useState } from 'react';
import type { Transaction, Position } from '../../logic/types';
import { fetchLivePrices } from '../../logic/api';
import { t } from '../../i18n/config';
import { parseCsvFile } from '../../logic/parser';
import { calculatePositions as calcPosSync } from '../../logic/finance';
import CashAnalysis from '../CashAnalysis/CashAnalysis';
import Uploader from '../Uploader/Uploader';
import TransactionTable from '../Transactions/TransactionTable';
import StockAnalysis from '../StockAnalysis/StockAnalysis';
import IncomeAnalysis from '../IncomeAnalysis/IncomeAnalysis';
import PositionDetail from '../PositionDetail/PositionDetail'
import './App.css';

type ViewState = 'UPLOAD' | 'TRANSACTIONS' | 'ANALYSIS' | 'DETAIL' | 'CASH' | 'INCOME';

const MARKET_DATA_STORAGE_KEY = 'tr-analyzer-online-market-data-enabled';

function getInitialMarketDataPreference() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(MARKET_DATA_STORAGE_KEY) === 'true';
}

function findMatchingPosition(positions: Position[], selected: Position | null) {
  if (!selected) {
    return null;
  }

  return positions.find(pos =>
    pos.Symbol === selected.Symbol &&
    pos.Name === selected.Name &&
    pos.Account === selected.Account
  ) ?? selected;
}

export default function App() {
  const [view, setView] = useState<ViewState>('UPLOAD');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [useExternalMarketData, setUseExternalMarketData] = useState(getInitialMarketDataPreference);

  const handleUpload = async (file: File) => {
    const data = await parseCsvFile(file);
    setTransactions(data);
    setPositions([]);
    setSelectedPos(null);
    setView('TRANSACTIONS');
  };

  const handleAnalyze = async () => {
    const basePositions = calcPosSync(transactions);
    setPositions(basePositions);
    setView('ANALYSIS');

    if (useExternalMarketData) {
      // Asynchronously enrich with live prices when online market data is enabled.
      const enriched = await fetchLivePrices(basePositions, { useExternalMarketData });
      setPositions([...enriched]);
    }
  };

  const handleSelectPosition = (pos: Position) => {
    setSelectedPos(pos);
    setView('DETAIL');
  };

  const handleMarketDataToggle = async (enabled: boolean) => {
    setUseExternalMarketData(enabled);
    window.localStorage.setItem(MARKET_DATA_STORAGE_KEY, String(enabled));

    if (transactions.length === 0 || positions.length === 0) {
      return;
    }

    const basePositions = calcPosSync(transactions);
    setPositions(basePositions);
    setSelectedPos(findMatchingPosition(basePositions, selectedPos));

    if (enabled) {
      const enriched = await fetchLivePrices(basePositions, { useExternalMarketData: true });
      setPositions([...enriched]);
      setSelectedPos(findMatchingPosition(enriched, selectedPos));
    }
  };

  return (
    <div className="app-container">
      {transactions.length > 0 && (
        <div className="market-data-controls">
          <label className="market-data-toggle">
            <input
              type="checkbox"
              checked={useExternalMarketData}
              onChange={(event) => handleMarketDataToggle(event.target.checked)}
            />
            <span>{t('online_market_data')}</span>
          </label>
          <span className={useExternalMarketData ? 'mode-online' : 'mode-offline'}>
            {useExternalMarketData ? t('online_mode') : t('offline_mode')}
          </span>
        </div>
      )}

      {view === 'UPLOAD' && <Uploader onUpload={handleUpload} />}

      {view === 'TRANSACTIONS' && (
        <div className="view-wrapper">
          <div className="action-buttons">
            <button onClick={handleAnalyze}>{t('analyze_stocks')}</button>
            <button className="btn-secondary" onClick={() => setView('CASH')}>{t('analyze_cash')}</button>
            <button className="btn-income" onClick={() => setView('INCOME')}>{t('analyze_income')}</button>
          </div>
          <TransactionTable transactions={transactions} />
        </div>
      )}

      {view === 'ANALYSIS' && (
        <StockAnalysis
          positions={positions}
          transactions={transactions}
          onSelectPosition={handleSelectPosition}
          useExternalMarketData={useExternalMarketData}
          onBack={() => setView('TRANSACTIONS')}
        />
      )}

      {view === 'DETAIL' && selectedPos && (
        <PositionDetail
          position={selectedPos}
          transactions={transactions}
          onBack={() => setView('ANALYSIS')}
          useExternalMarketData={useExternalMarketData}
        />
      )}

      {view === 'CASH' && (
        <div className="view-wrapper">
          <button className="back-btn" onClick={() => setView('TRANSACTIONS')}>
            &larr; {t('back_to_transactions')}
          </button>
          <CashAnalysis transactions={transactions} />
        </div>
      )}

      {view === 'INCOME' && (
        <div className="view-wrapper">
          <button className="back-btn" onClick={() => setView('TRANSACTIONS')}>
            &larr; {t('back_to_transactions')}
          </button>
          <IncomeAnalysis transactions={transactions} />
        </div>
      )}
    </div>
  );
}
