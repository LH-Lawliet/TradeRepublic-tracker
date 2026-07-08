import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import type { PortfolioChartPoint } from '../../logic/types';
import { t } from '../../i18n/config';

interface Props {
    data: PortfolioChartPoint[];
    mode: 'ABSOLUTE' | 'RELATIVE';
    symbols: string[];
    symbolNames: Record<string, string>; // Added prop to receive the symbol-to-name mapping
    isStacked: boolean;
    isMerged: boolean;
}

const COLORS = [
    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
    '#ec4899', '#06b6d4', '#84cc16', '#f43f5e', '#6366f1'
];

function PortfolioChart({ data, mode, symbols, symbolNames, isStacked, isMerged }: Props) {
    // State to track which specific Area is being hovered
    const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);

    // 1. Dynamic Downsampling Logic
    const displayData = useMemo(() => {
        const MAX_POINTS = 500;

        if (data.length <= MAX_POINTS) {
            return data;
        }

        // Calculate how many points to skip to keep the total under MAX_POINTS
        const step = Math.ceil(data.length / MAX_POINTS);

        return data.filter((_, index, arr) =>
            // Always keep the first point, the last point, and every 'step' point
            index === 0 || index === arr.length - 1 || index % step === 0
        );
    }, [data]);

    if (displayData.length === 0 || (symbols.length === 0 && !isMerged)) {
        return <p>{t('no_chart_data')}</p>;
    }

    const isAbsolute = mode === 'ABSOLUTE';
    const domain: [any, any] = (isStacked && !isMerged) ? [0, 'auto'] : ['auto', 'auto'];

    // Custom Tooltip that filters out un-hovered stack items
    const renderCustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;

        // If in separated mode and hovering over a specific symbol, filter the tooltip data
        const displayPayload = (!isMerged && hoveredSymbol)
            ? payload.filter((entry: any) =>
                entry.dataKey === `${hoveredSymbol}_absolute` ||
                entry.dataKey === `${hoveredSymbol}_relative`
            )
            : payload;

        if (displayPayload.length === 0) return null;

        return (
            <div style={{ backgroundColor: '#1e293b', padding: '10px', borderRadius: '0.5vw' }}>
                <p style={{ margin: '0 0 5px 0', color: '#94a3b8', fontSize: '0.8rem' }}>{label}</p>
                {displayPayload.map((entry: any) => {
                    const safeName = String(entry.name || entry.dataKey || '');
                    const cleanName = safeName.replace('_absolute', '').replace('_relative', '');

                    // Look up the actual stock name using the mapped symbolNames, fallback to cleanName
                    const labelName = (cleanName === 'absoluteValue' || cleanName === 'relativeReturn')
                        ? t('total_portfolio')
                        : (symbolNames[cleanName] || cleanName);

                    const val = Number(entry.value) || 0;
                    const valueStr = isAbsolute ? `€${val.toFixed(2)}` : `${val.toFixed(2)}%`;

                    return (
                        <div key={entry.dataKey} style={{ color: '#f8fafc', marginBottom: '2px', fontSize: '0.9rem' }}>
                            <span style={{ color: entry.color, marginRight: '8px' }}>●</span>
                            {labelName}: {valueStr}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <ResponsiveContainer width="100%" height="100%">
            {/* 2. Feed the decimated data to the chart, clear hover on mouse leave */}
            <AreaChart data={displayData} onMouseLeave={() => setHoveredSymbol(null)}>
                <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                    minTickGap={40}
                />
                <YAxis
                    domain={domain}
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                    tickFormatter={(val) => isAbsolute ? `€${val.toFixed(0)}` : `${val.toFixed(2)}%`}
                />
                <Tooltip content={renderCustomTooltip} />

                {isMerged ? (
                    <Area
                        key="merged-total"
                        type="monotone"
                        dataKey={isAbsolute ? "absoluteValue" : "relativeReturn"}
                        stroke={COLORS[0]}
                        fill={COLORS[0]}
                        fillOpacity={0.2}
                        strokeWidth={2}
                        isAnimationActive={false}
                    />
                ) : (
                    symbols.map((sym, index) => {
                        const color = COLORS[index % COLORS.length];
                        const dataKey = isAbsolute ? `${sym}_absolute` : `${sym}_relative`;

                        return (
                            <Area
                                key={sym}
                                type="monotone"
                                dataKey={dataKey}
                                stackId={isStacked ? "1" : undefined}
                                stroke={color}
                                fill={color}
                                fillOpacity={isStacked ? 0.6 : 0.2}
                                strokeWidth={2}
                                isAnimationActive={false}
                                onMouseEnter={() => setHoveredSymbol(sym)}
                            />
                        );
                    })
                )}
            </AreaChart>
        </ResponsiveContainer>
    );
}

// Wrap the export in React.memo to prevent unnecessary SVG recalculations
export default React.memo(PortfolioChart);