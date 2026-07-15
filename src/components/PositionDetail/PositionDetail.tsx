import { useEffect, useState } from 'react';
import type { Position, Transaction, ChartPoint, RoiRecord } from '../../logic/types';
import { fetchYahooChart } from '../../logic/api';
import { calculateAssetROI, generateFallbackChart } from '../../logic/finance';
import { t } from '../../i18n/config';
import AssetChart from '../Chart/AssetChart';
import './PositionDetail.css';

interface Props {
    position: Position;
    transactions: Transaction[];
    onBack: () => void;
    useExternalMarketData: boolean;
}

export default function PositionDetail({ position, transactions, onBack, useExternalMarketData }: Props) {
    const [chartData, setChartData] = useState<ChartPoint[]>([]);
    const [roiData, setRoiData] = useState<RoiRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            setLoading(true);

            // 1. Identify the oldest transaction date to set our chart boundary
            let earliestTransactionDate: string | undefined = undefined;
            if (transactions && transactions.length > 0) {
                // Fixed TS Error with optional chaining and ensuring we use capital .Date
                earliestTransactionDate = transactions.reduce((earliest, current) => {
                    return current.date < earliest ? current.date : earliest;
                }, transactions[0]?.date as string);
            }

            // 2. Fetch chart data spanning from that historical boundary to today
            let history = useExternalMarketData
                ? await fetchYahooChart(position.Symbol, earliestTransactionDate, { useExternalMarketData })
                : [];

            if (history.length === 0 && earliestTransactionDate) {
                history = generateFallbackChart(position.Symbol, transactions, earliestTransactionDate);
            }

            setChartData(history);

            // 3. Calculate ROI
            const roi = calculateAssetROI(transactions, position.Symbol, position.Price);
            setRoiData(roi);

            setLoading(false);
        }
        loadData();
    }, [position, transactions, useExternalMarketData]);

    return (
        <div className="detail-container">
            <button className="back-btn" onClick={onBack}>&larr; {t('back_to_analysis')}</button>

            <header className="detail-header">
                <h2>{position.Name} ({position.Symbol})</h2>
                <div className="stats">
                    <span>{t('total_value')}: €{position.TotalValue.toFixed(2)}</span>
                </div>
            </header>

            <div className="chart-section">
                {loading ? <p>{t('loading_chart')}</p> : <AssetChart data={chartData} trades={roiData} />}
            </div>

            <div className="roi-section">
                <h3>{t('trade_history')}</h3>
                <table>
                    <thead>
                        <tr>
                            <th>{t('date')}</th>
                            <th>{t('type')}</th>
                            <th>{t('amount')}</th>
                            <th>{t('roi_abs')}</th>
                            <th>{t('roi_ann')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {roiData.map((r, i) => {
                            const isBuy = r.Type.toUpperCase() === 'BUY';
                            return (
                                <tr key={i}>
                                    <td>{r.Date}</td>
                                    <td>{r.Type}</td>
                                    <td>€{r.Invested.toFixed(2)}</td>

                                    {/* Only show ROI calculations for BUY transactions */}
                                    <td className={isBuy ? (r.RoiAbs >= 0 ? 'pos' : 'neg') : 'neutral'}>
                                        {isBuy ? `${(r.RoiAbs * 100).toFixed(2)}%` : '-'}
                                    </td>
                                    <td className={isBuy ? (r.RoiAnn >= 0 ? 'pos' : 'neg') : 'neutral'}>
                                        {isBuy ? `${(r.RoiAnn * 100).toFixed(2)}%` : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
