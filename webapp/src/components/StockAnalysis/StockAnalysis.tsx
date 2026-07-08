import { useState, useMemo, useEffect } from 'react';
import type { Position, Transaction, PortfolioChartPoint } from '../../logic/types';
import { buildPortfolioHistory } from '../../logic/portfolio';
import PortfolioChart from '../Chart/PortfolioChart';
import { t } from '../../i18n/config';
import './StockAnalysis.css';

interface Props {
    positions: Position[];
    transactions: Transaction[];
    onSelectPosition: (pos: Position) => void;
}

export default function StockAnalysis({ positions, transactions, onSelectPosition }: Props) {
    const [filter, setFilter] = useState<string>('ALL');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

    // Chart States
    const [chartMode, setChartMode] = useState<'ABSOLUTE' | 'RELATIVE'>('ABSOLUTE');
    const [isMerged, setIsMerged] = useState<boolean>(true);
    const [isStacked, setIsStacked] = useState<boolean>(false);
    const [chartData, setChartData] = useState<PortfolioChartPoint[]>([]);
    const [isChartLoading, setIsChartLoading] = useState(false);

    const categories = useMemo(() => {
        const cats = new Set(positions.map(p => p.Account));
        return Array.from(cats);
    }, [positions]);

    const filteredAndSortedPositions = useMemo(() => {
        // Filter
        let result = positions;
        if (filter !== 'ALL') {
            result = positions.filter(p => p.Account === filter);
        }

        // Sort (using spread syntax [...] to avoid mutating the original array)
        return [...result].sort((a, b) => {
            if (sortOrder === 'desc') return b.TotalValue - a.TotalValue;
            return a.TotalValue - b.TotalValue;
        });
    }, [positions, filter, sortOrder]);

    const totalValue = filteredAndSortedPositions.reduce((sum, p) => sum + p.TotalValue, 0);

    // extract symbols for the chart
    const activeSymbols = useMemo(() => {
        const uniqueSymbols = new Set(filteredAndSortedPositions.map(p => p.Symbol).filter(s => s !== '-'));
        return Array.from(uniqueSymbols);
    }, [filteredAndSortedPositions])

    // Rebuild the chart whenever the user changes the filter
    useEffect(() => {
        let isMounted = true;
        async function loadChartData() {
            setIsChartLoading(true);
            const history = await buildPortfolioHistory(filteredAndSortedPositions, transactions);
            if (isMounted) {
                setChartData(history);
                setIsChartLoading(false);
            }
        }
        loadChartData();
        return () => { isMounted = false; };
    }, [filteredAndSortedPositions, transactions]);

    return (
        <div className="analysis-container">
            <header className="analysis-header">
                <h2>{t('total_portfolio')}: €{totalValue.toFixed(2)}</h2>
                <div className="header-controls">
                    <select onChange={(e) => setFilter(e.target.value)} value={filter}>
                        <option value="ALL">{t('filter_all')}</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')} value={sortOrder}>
                        <option value="desc">{t('sort_value_highest')}</option>
                        <option value="asc">{t('sort_value_lowest')}</option>
                    </select>
                </div>
            </header>

            {/* Global Portfolio Chart Section */}
            <div className="global-chart-section">
                <div className="chart-header">
                    <h3>{t('portfolio_evolution')}</h3>
                    <div className="chart-toggles">
                        <button
                            className={isMerged ? 'active' : ''}
                            onClick={() => setIsMerged(!isMerged)}
                            style={{ marginRight: '1vw' }}
                        >
                            {isMerged ? t('chart_merged') : t('chart_separated')}
                        </button>

                        {!isMerged && (
                            <button
                                className={isStacked ? 'active' : ''}
                                onClick={() => setIsStacked(!isStacked)}
                                style={{ marginRight: '1vw' }}
                            >
                                {isStacked ? t('chart_stacked') : t('chart_overlapped')}
                            </button>
                        )}

                        <button
                            className={chartMode === 'ABSOLUTE' ? 'active' : ''}
                            onClick={() => setChartMode('ABSOLUTE')}
                        >
                            {t('mode_absolute')}
                        </button>
                        <button
                            className={chartMode === 'RELATIVE' ? 'active' : ''}
                            onClick={() => setChartMode('RELATIVE')}
                        >
                            {t('mode_relative')}
                        </button>
                    </div>
                </div>
                <div className="chart-wrapper">
                    {isChartLoading ? <p>{t('loading_chart')}</p> : <PortfolioChart
                        data={chartData}
                        mode={chartMode}
                        symbols={activeSymbols}
                        isStacked={isStacked}
                        isMerged={isMerged}
                    />}
                </div>
            </div>

            <div className="positions-grid">
                {filteredAndSortedPositions.map(pos => (
                    <div
                        key={pos.Symbol + pos.Name}
                        className="position-card"
                        onClick={() => onSelectPosition(pos)}
                    >
                        <div className="card-top">
                            <span className="symbol">{pos.Symbol}</span>
                            <span className="account">{pos.Account}</span>
                        </div>
                        <h3 className="name">{pos.Name}</h3>
                        <div className="card-metrics">
                            <span>{t('quantity')}: {pos.Quantity}</span>
                            <span>{t('price')}: €{pos.Price.toFixed(2)}</span>
                            <span className="total">€{pos.TotalValue.toFixed(2)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}