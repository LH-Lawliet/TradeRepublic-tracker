import { useMemo, useState } from 'react';
import {
    ResponsiveContainer,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    LabelList
} from 'recharts';
import type { Transaction } from '../../logic/types';
import { processIncomeTransactions } from '../../logic/income';
import { t } from '../../i18n/config';
import './IncomeAnalysis.css';

interface Props {
    transactions: Transaction[];
}

interface IncomeTooltipPayload {
    dataKey?: string | number;
    value?: string | number;
    color?: string;
}

interface IncomeTooltipProps {
    active?: boolean;
    label?: string;
    payload?: IncomeTooltipPayload[];
}

type IncomeGrouping = 'month' | 'quarter' | 'year';

interface IncomeChartRow {
    month: string;
    sortKey: string;
    dividend: number;
    interest: number;
    total: number;
    visibleTotal: number;
    [key: string]: string | number;
}

function formatMoney(value: number) {
    return `EUR ${value.toFixed(2)}`;
}

function getPeriod(date: string, grouping: IncomeGrouping) {
    const year = date.substring(0, 4);
    const month = Number(date.substring(5, 7));

    if (grouping === 'year') {
        return { label: year, sortKey: year };
    }

    if (grouping === 'quarter') {
        const quarter = Math.floor((month - 1) / 3) + 1;
        return { label: `${year} Q${quarter}`, sortKey: `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}` };
    }

    return { label: date.substring(0, 7), sortKey: date.substring(0, 7) };
}

function IncomeTooltip({ active, label, payload }: IncomeTooltipProps) {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const rows = payload
        .filter(entry => entry.dataKey === 'dividend' || entry.dataKey === 'interest')
        .map(entry => ({
            key: String(entry.dataKey),
            label: entry.dataKey === 'dividend' ? t('dividends') : t('interest'),
            value: Number(entry.value) || 0,
            color: entry.color || '#94a3b8'
        }));

    if (rows.length === 0) {
        return null;
    }

    const visibleTotal = rows.reduce((sum, row) => sum + row.value, 0);

    return (
        <div className="income-tooltip">
            <div className="tooltip-label">{label}</div>
            {rows.map(row => (
                <div className="tooltip-entry" key={row.key}>
                    <span className="tooltip-dot" style={{ color: row.color }}>●</span>
                    <span>{row.label}: {formatMoney(row.value)}</span>
                </div>
            ))}
            <div className="tooltip-total">{t('visible_total')}: {formatMoney(visibleTotal)}</div>
        </div>
    );
}

export default function IncomeAnalysis({ transactions }: Props) {
    const income = useMemo(() => processIncomeTransactions(transactions), [transactions]);
    const [showDividends, setShowDividends] = useState(true);
    const [showInterest, setShowInterest] = useState(true);
    const [grouping, setGrouping] = useState<IncomeGrouping>('month');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const chartData = useMemo(() => {
        const grouped = income.records
            .filter(record => (!dateFrom || record.date >= dateFrom) && (!dateTo || record.date <= dateTo))
            .reduce((map, record) => {
                const period = getPeriod(record.date, grouping);
                let row = map[period.label];

                if (!row) {
                    row = {
                        month: period.label,
                        sortKey: period.sortKey,
                        dividend: 0,
                        interest: 0,
                        total: 0,
                        visibleTotal: 0
                    };
                    map[period.label] = row;
                }

                if (record.type === 'dividend') {
                    row.dividend += record.amount;
                } else {
                    row.interest += record.amount;
                }
                row.total += record.amount;
                return map;
            }, {} as Record<string, IncomeChartRow>);

        return Object.values(grouped)
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
            .map(row => ({
                ...row,
                visibleTotal: (showDividends ? row.dividend : 0) + (showInterest ? row.interest : 0)
            }));
    }, [income.records, grouping, dateFrom, dateTo, showDividends, showInterest]);

    const hasVisibleSeries = showDividends || showInterest;
    const hasAnyIncome = income.records.length > 0;

    return (
        <div className="income-container">
            <header className="income-header">
                <h2>{t('income_analysis')}</h2>
                <div className="income-summary">
                    <div className="income-metric">
                        <span>{t('total_income')}</span>
                        <strong>{formatMoney(income.totalIncome)}</strong>
                    </div>
                    <div className="income-metric dividend">
                        <span>{t('dividends')}</span>
                        <strong>{formatMoney(income.totalDividend)}</strong>
                    </div>
                    <div className="income-metric interest">
                        <span>{t('interest')}</span>
                        <strong>{formatMoney(income.totalInterest)}</strong>
                    </div>
                </div>
            </header>

            <section className="income-chart-section">
                <div className="income-chart-header">
                    <h3>{t('income_chart')}</h3>
                    <div className="income-chart-controls">
                        <div className="income-series-controls">
                            <button
                                type="button"
                                className={`series-toggle dividend ${showDividends ? 'active' : ''}`}
                                onClick={() => setShowDividends(value => !value)}
                            >
                                {t('dividends')}
                            </button>
                            <button
                                type="button"
                                className={`series-toggle interest ${showInterest ? 'active' : ''}`}
                                onClick={() => setShowInterest(value => !value)}
                            >
                                {t('interest')}
                            </button>
                        </div>
                        <label className="income-control">
                            <span>{t('group_by')}</span>
                            <select value={grouping} onChange={(event) => setGrouping(event.target.value as IncomeGrouping)}>
                                <option value="month">{t('group_month')}</option>
                                <option value="quarter">{t('group_quarter')}</option>
                                <option value="year">{t('group_year')}</option>
                            </select>
                        </label>
                        <label className="income-control">
                            <span>{t('date_from')}</span>
                            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                        </label>
                        <label className="income-control">
                            <span>{t('date_to')}</span>
                            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                        </label>
                        <button
                            type="button"
                            className="range-reset"
                            onClick={() => {
                                setDateFrom('');
                                setDateTo('');
                            }}
                        >
                            {t('reset_range')}
                        </button>
                    </div>
                </div>
                {!hasAnyIncome ? (
                    <p className="income-empty">{t('income_no_data')}</p>
                ) : !hasVisibleSeries ? (
                    <p className="income-empty">{t('income_no_series_selected')}</p>
                ) : chartData.length === 0 ? (
                    <p className="income-empty">{t('income_no_data_in_range')}</p>
                ) : (
                    <div className="income-chart-wrapper">
                        <ResponsiveContainer width="100%" height={420}>
                            <ComposedChart
                                data={chartData}
                                margin={{ top: 34, right: 12, left: 0, bottom: 0 }}
                            >
                                <XAxis
                                    dataKey="month"
                                    stroke="#94a3b8"
                                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                                />
                                <YAxis
                                    stroke="#94a3b8"
                                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                                    tickFormatter={(value) => `EUR ${Number(value).toFixed(0)}`}
                                />
                                <Tooltip content={<IncomeTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8' }} />
                                {showDividends && (
                                    <Bar
                                        dataKey="dividend"
                                        name={t('dividends')}
                                        stackId="income"
                                        fill="#22c55e"
                                    />
                                )}
                                {showInterest && (
                                    <Bar
                                        dataKey="interest"
                                        name={t('interest')}
                                        stackId="income"
                                        fill="#38bdf8"
                                    />
                                )}
                                <Line
                                    dataKey="visibleTotal"
                                    type="monotone"
                                    stroke="transparent"
                                    dot={false}
                                    activeDot={false}
                                    legendType="none"
                                >
                                    <LabelList
                                        dataKey="visibleTotal"
                                        position="top"
                                        fill="#94a3b8"
                                        fontSize="0.8rem"
                                        formatter={(value: any) => {
                                            const total = Number(value);
                                            return total > 0 ? formatMoney(total) : '';
                                        }}
                                    />
                                </Line>
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </section>
        </div>
    );
}
