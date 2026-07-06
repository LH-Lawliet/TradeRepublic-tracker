import { useState } from 'react';
import type { Transaction, Position } from '../../logic/types';
import { fetchLivePrices } from '../../logic/api';
import { t } from '../../i18n/config';
import { parseCsvFile } from '../../logic/parser';
import { calculatePositions as calcPosSync } from '../../logic/finance';
import Uploader from '../Uploader/Uploader';
import TransactionTable from '../Transactions/TransactionTable';
import StockAnalysis from '../StockAnalysis/StockAnalysis';
import PositionDetail from '../PositionDetail/PositionDetail'
import './App.css';

type ViewState = 'UPLOAD' | 'TRANSACTIONS' | 'ANALYSIS' | 'DETAIL';

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
          <button onClick={handleAnalyze}>{t('analyze_stocks')}</button>
          <TransactionTable transactions={transactions} />
        </div>
      )}

      {view === 'ANALYSIS' && (
        <StockAnalysis
          positions={positions}
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
    </div>
  );
}
