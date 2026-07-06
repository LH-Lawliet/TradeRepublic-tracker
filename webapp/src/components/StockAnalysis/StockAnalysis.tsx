import { useState, useMemo } from 'react';
import type { Position } from '../../logic/types';
import { t } from '../../i18n/config';
import './StockAnalysis.css';

interface Props {
    positions: Position[];
    onSelectPosition: (pos: Position) => void;
}

export default function StockAnalysis({ positions, onSelectPosition }: Props) {
    const [filter, setFilter] = useState<string>('ALL');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

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
            if (sortOrder === 'desc') {
                return b.TotalValue - a.TotalValue;
            }
            return a.TotalValue - b.TotalValue;
        });
    }, [positions, filter, sortOrder]);

    const totalValue = positions.reduce((sum, p) => sum + p.TotalValue, 0);

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
                        <option value="desc">{t('sort_value_highest') || 'Highest Value'}</option>
                        <option value="asc">{t('sort_value_lowest') || 'Lowest Value'}</option>
                    </select>
                </div>
            </header>

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