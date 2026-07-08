import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import type { PortfolioChartPoint } from '../../logic/types';
import { t } from '../../i18n/config';

interface Props {
    data: PortfolioChartPoint[];
    mode: 'ABSOLUTE' | 'RELATIVE';
}

export default function PortfolioChart({ data, mode }: Props) {
    if (data.length === 0) return <p>{t('no_chart_data')}</p>;

    const isAbsolute = mode === 'ABSOLUTE';
    const dataKey = isAbsolute ? 'absoluteValue' : 'relativeReturn';
    const color = isAbsolute ? '#3b82f6' : '#8b5cf6';

    const minVal = Math.min(...data.map(d => d[dataKey])) * (isAbsolute ? 0.95 : 1.1);
    const maxVal = Math.max(...data.map(d => d[dataKey])) * (isAbsolute ? 1.05 : 1.1);

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
                <defs>
                    <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                    minTickGap={40}
                />
                <YAxis
                    domain={[minVal, maxVal]}
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                    tickFormatter={(val) => isAbsolute ? `€${val.toFixed(0)}` : `${val.toFixed(2)}%`}
                />
                <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '0.5vw' }}
                    itemStyle={{ color: '#f8fafc' }}
                    formatter={(value: any) => {
                        const val = Number(value) || 0;
                        return isAbsolute ? [`€${val.toFixed(2)}`, 'Value'] : [`${val.toFixed(2)}%`, 'ROI'];
                    }}
                />
                <Area
                    type="monotone"
                    dataKey={dataKey}
                    stroke={color}
                    fillOpacity={1}
                    fill="url(#colorGradient)"
                    strokeWidth={2}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}