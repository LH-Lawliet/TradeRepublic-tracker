import { useEffect, useState } from 'react';
import type { Position, Transaction, ChartPoint, RoiRecord } from '../../logic/types';
import { fetchYahooChart } from '../../logic/api';
import { calculateAssetROI } from '../../logic/finance';
import { t } from '../../i18n/config';
import AssetChart from '../Chart/AssetChart';
import './PositionDetail.css';

interface Props {
    position: Position;
    transactions: Transaction[];
    onBack: () => void;
}

export default function PositionDetail({ position, transactions, onBack }: Props) {
    const [chartData, setChartData] = useState<ChartPoint[]>([]);
    const [roiData, setRoiData] = useState<RoiRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            const history = await fetchYahooChart(position.Symbol);
            setChartData(history);

            const roi = calculateAssetROI(transactions, position.Symbol, position.Price);
            setRoiData(roi);
            setLoading(false);
        }
        loadData();
    }, [position, transactions]);

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
                        {roiData.map((r, i) => (
                            <tr key={i}>
                                <td>{r.Date}</td>
                                <td>{r.Type}</td>
                                <td>€{r.Invested.toFixed(2)}</td>
                                <td className={r.RoiAbs >= 0 ? 'pos' : 'neg'}>
                                    {(r.RoiAbs * 100).toFixed(2)}%
                                </td>
                                <td className={r.RoiAnn >= 0 ? 'pos' : 'neg'}>
                                    {(r.RoiAnn * 100).toFixed(2)}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}