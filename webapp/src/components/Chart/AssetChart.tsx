import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot } from 'recharts';
import type { ChartPoint, RoiRecord } from '../../logic/types';
import { t } from '../../i18n/config';

interface Props {
    data: ChartPoint[];
    trades: RoiRecord[];
}

export default function AssetChart({ data, trades }: Props) {
    if (data.length === 0) return <p>{t('no_chart_data')}</p>;

    // Finding bounds to make the chart scale nicely
    const minPrice = Math.min(...data.map(d => d.price)) * 0.95;
    const maxPrice = Math.max(...data.map(d => d.price)) * 1.05;

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
                <XAxis 
                    dataKey="date" 
                    stroke="#94a3b8" 
                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                    minTickGap={30}
                />
                <YAxis 
                    domain={[minPrice, maxPrice]} 
                    stroke="#94a3b8" 
                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                    tickFormatter={(val) => `€${val.toFixed(0)}`}
                />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '0.5vw' }}
                    itemStyle={{ color: '#f8fafc' }}
                />
                <Line 
                    type="monotone" 
                    dataKey="price" 
                    stroke="#3b82f6" 
                    strokeWidth={2} 
                    dot={false} 
                />
                
                {/* Overlay Trade Execution points */}
                {trades.map((trade, idx) => (
                    <ReferenceDot 
                        key={idx}
                        x={trade.Date} 
                        y={trade.BuyPrice} 
                        r={4} 
                        fill={trade.Type.includes('BUY') ? '#22c55e' : '#ef4444'} 
                        stroke="none"
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    );
}