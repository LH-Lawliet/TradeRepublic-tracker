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
import PositionDetail from '../PositionDetail/PositionDetail'
import './App.css';

type ViewState = 'UPLOAD' | 'TRANSACTIONS' | 'ANALYSIS' | 'DETAIL' | 'CASH';

export default function App() {
  const [view, setView] = useState<ViewState>('UPLOAD');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);

  const handleUpload = async (file: File) => {
    const data = await parseCsvFile(file);
    setTransactions(data);
    setView('TRANSACTIONS');
  };

  const handleAnalyze = async () => {
    const basePositions = calcPosSync(transactions);
    setPositions(basePositions);
    setView('ANALYSIS');

    // Asynchronously enrich with live prices
    const enriched = await fetchLivePrices(basePositions);
    setPositions([...enriched]);
  };

  const handleSelectPosition = (pos: Position) => {
    setSelectedPos(pos);
    setView('DETAIL');
  };

  return (
    <div className="app-container">
      {view === 'UPLOAD' && <Uploader onUpload={handleUpload} />}

      {view === 'TRANSACTIONS' && (
        <div className="view-wrapper">
          <div className="action-buttons">
            <button onClick={handleAnalyze}>{t('analyze_stocks')}</button>
            <button className="btn-secondary" onClick={() => setView('CASH')}>{t('analyze_cash')}</button>
          </div>
          <TransactionTable transactions={transactions} />
        </div>
      )}

      {view === 'ANALYSIS' && (
        <StockAnalysis
          positions={positions}
          transactions={transactions}
          onSelectPosition={handleSelectPosition}
        />
      )}

      {view === 'DETAIL' && selectedPos && (
        <PositionDetail
          position={selectedPos}
          transactions={transactions}
          onBack={() => setView('ANALYSIS')}
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
    </div>
  );
}
