import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Tooltip, Cell } from 'recharts';
import type { Position } from '../../logic/types';
import { t } from '../../i18n/config';
import './DistributionChart.css';

const COLORS = [
    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
    '#ec4899', '#06b6d4', '#84cc16', '#f43f5e', '#6366f1'
];

interface Props {
    positions: Position[];
}

export default function DistributionChart({ positions }: Props) {
    const { categoryData, assetData } = useMemo(() => {
        // 1. Filter out zero/negative values
        const validPositions = positions.filter(p => p.TotalValue > 0);

        // 2. Group positions hierarchically
        const grouped: Record<string, { total: number, assets: any[] }> = {};
        validPositions.forEach(p => {
            let group = grouped[p.Account];
            if (!group) {
                group = { total: 0, assets: [] };
                grouped[p.Account] = group;
            }
            group.total += p.TotalValue;
            group.assets.push({
                name: p.Name || p.Symbol,
                value: p.TotalValue,
                category: p.Account
            });
        });

        // 3. Extract entries and sort categories by their total value (largest categories first)
        const sortedEntries = Object.entries(grouped).sort(
            ([, infoA], [, infoB]) => infoB.total - infoA.total
        );

        const categoryData: any[] = [];
        const assetData: any[] = [];

        // 4. Build the flattened arrays sequentially to preserve angular alignment
        sortedEntries.forEach(([catName, catInfo], index) => {
            // Push the inner ring data
            categoryData.push({
                name: catName,
                value: catInfo.total,
                colorIndex: index // Keep track of the color index for the outer ring
            });

            // Sort assets within this specific category
            const sortedAssets = catInfo.assets.sort((a, b) => b.value - a.value);

            // Push the outer ring data, tagging them with the parent's color index
            sortedAssets.forEach(asset => {
                assetData.push({
                    ...asset,
                    colorIndex: index
                });
            });
        });

        return { categoryData, assetData };
    }, [positions]);

    if (assetData.length === 0) return null;

    return (
        <div className="distribution-section">
            <header className="chart-header">
                <h3>{t('portfolio_distribution')}</h3>
            </header>
            <div className="pie-wrapper">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        {/* Inner Ring: Categories */}
                        <Pie
                            data={categoryData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius="45%"
                            stroke="var(--bg-secondary)"
                            strokeWidth={3}
                        >
                            {categoryData.map((entry, index) => (
                                <Cell key={`cat-${index}`} fill={COLORS[entry.colorIndex % COLORS.length]} />
                            ))}
                        </Pie>

                        {/* Outer Ring: Assets */}
                        <Pie
                            data={assetData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius="55%"
                            outerRadius="75%"
                            stroke="var(--bg-secondary)"
                            strokeWidth={2}
                            label={({ name, percent = 0 }: any) => percent > 0.03 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                            labelLine={false}
                        >
                            {assetData.map((entry, index) => {
                                const baseColor = COLORS[entry.colorIndex % COLORS.length];
                                // Varies opacity slightly so assets of the same category don't blend entirely
                                const opacity = 0.9 - (index % 3) * 0.15;
                                return <Cell key={`ast-${index}`} fill={baseColor} fillOpacity={opacity} />;
                            })}
                        </Pie>

                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '0.5vw' }}
                            itemStyle={{ color: '#f8fafc' }}
                            formatter={(value: any) => `€${Number(value || 0).toFixed(2)}`}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}