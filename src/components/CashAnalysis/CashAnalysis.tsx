import { useEffect, useState } from 'react';
import {
    ResponsiveContainer,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    LabelList,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import type { Transaction } from '../../logic/types';
import {
    processCashTransactions,
    type CashBalancePoint,
    type CashMovementRecord,
    type ExpenseRecord,
    type MonthlyExpenseChartData
} from '../../logic/cash';
import { t } from '../../i18n/config';
import './CashAnalysis.css';

interface Props {
    transactions: Transaction[];
}

function formatMoney(value: number) {
    return `€${Number(value).toFixed(2)}`;
}

export default function CashAnalysis({ transactions }: Props) {
    const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
    const [cashMovements, setCashMovements] = useState<CashMovementRecord[]>([]);
    const [cashBalanceData, setCashBalanceData] = useState<CashBalancePoint[]>([]);
    const [currentCashBalance, setCurrentCashBalance] = useState(0);
    const [chartData, setChartData] = useState<MonthlyExpenseChartData[]>([]);
    const [uniqueCategories, setUniqueCategories] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        async function loadData() {
            setIsLoading(true);
            const data = await processCashTransactions(transactions);
            if (isMounted) {
                setExpenses(data.expenses);
                setCashMovements(data.cashMovements);
                setCashBalanceData(data.cashBalanceData);
                setCurrentCashBalance(data.currentCashBalance);
                setChartData(data.chartData);
                setUniqueCategories(data.uniqueCategories);
                setIsLoading(false);
            }
        }

        loadData();
        return () => { isMounted = false; };
    }, [transactions]);

    if (isLoading) {
        return <div className="cash-container"><p>{t('cash_loading')}</p></div>;
    }

    if (expenses.length === 0 && cashMovements.length === 0) {
        return <div className="cash-container"><p>{t('cash_no_data')}</p></div>;
    }

    const categoryTotals = expenses.reduce((acc, exp) => {
        acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
        return acc;
    }, {} as Record<string, number>);

    const sortedCategories = [...uniqueCategories].sort(
        (a, b) => (categoryTotals[b] || 0) - (categoryTotals[a] || 0)
    );

    const chartDataWithTotals = chartData.map(monthData => {
        const monthTotal = sortedCategories.reduce(
            (sum, cat) => sum + (Number(monthData[cat]) || 0),
            0
        );
        return { ...monthData, monthTotal };
    });

    const pieData = sortedCategories.map(category => {
        const color = expenses.find(e => e.category === category)?.color || "#8884d8";
        return {
            name: category,
            value: categoryTotals[category],
            color
        };
    }).filter(data => data.value! > 0);

    return (
        <div className="cash-container">
            <header className="cash-header">
                <h2>{t('expense_analysis')}</h2>
                <div className="cash-stats">
                    <div className={currentCashBalance >= 0 ? 'stat positive' : 'stat negative'}>
                        <span>{t('cash_balance')}</span>
                        <strong>{formatMoney(currentCashBalance)}</strong>
                    </div>
                    <div className="stat spending">
                        <span>{t('total_tracked')}</span>
                        <strong>{formatMoney(expenses.reduce((sum, e) => sum + e.amount, 0))}</strong>
                    </div>
                </div>
            </header>

            <div className="chart-section cash-balance-section">
                <h3>{t('cash_balance_history')}</h3>
                {cashBalanceData.length === 0 ? (
                    <p className="cash-empty">{t('no_chart_data')}</p>
                ) : (
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={320}>
                            <ComposedChart
                                data={cashBalanceData}
                                margin={{ top: 20, right: 10, left: 0, bottom: 0 }}
                            >
                                <XAxis
                                    dataKey="date"
                                    stroke="#94a3b8"
                                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                                    minTickGap={40}
                                />
                                <YAxis
                                    stroke="#94a3b8"
                                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                                    tickFormatter={(value) => `€${Number(value).toFixed(0)}`}
                                />
                                <Tooltip formatter={(value: any) => formatMoney(Number(value))} />
                                <Line
                                    type="monotone"
                                    dataKey="balance"
                                    name={t('cash_balance')}
                                    stroke="#38bdf8"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            <div className="chart-section">
                <h3>{t('monthly_spending')}</h3>
                {expenses.length === 0 ? (
                    <p className="cash-empty">{t('cash_no_expenses')}</p>
                ) : (
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={400}>
                            <ComposedChart
                                data={chartDataWithTotals}
                                margin={{ top: 30, right: 10, left: 0, bottom: 0 }}
                            >
                                <XAxis
                                    dataKey="month"
                                    stroke="#94a3b8"
                                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                                />
                                <YAxis
                                    stroke="#94a3b8"
                                    tick={{ fill: '#94a3b8', fontSize: '0.8rem' }}
                                    tickFormatter={(value) => `€${Number(value).toFixed(0)}`}
                                />
                                <Tooltip
                                    shared={false}
                                    formatter={(value: any) => formatMoney(Number(value))}
                                />
                                <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8' }} />

                                {sortedCategories.map((category) => {
                                    const color = expenses.find(e => e.category === category)?.color || "#8884d8";

                                    return (
                                        <Bar
                                            key={category}
                                            dataKey={(row) => row[category] as number}
                                            name={category}
                                            stackId="a"
                                            fill={color}
                                        />
                                    );
                                })}

                                <Line
                                    dataKey="monthTotal"
                                    type="monotone"
                                    stroke="transparent"
                                    dot={false}
                                    activeDot={false}
                                    legendType="none"
                                >
                                    <LabelList
                                        dataKey="monthTotal"
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
            </div>

            <div className="chart-section">
                <h3>{t('lifelong_category_expenses')}</h3>
                {expenses.length === 0 ? (
                    <p className="cash-empty">{t('cash_no_expenses')}</p>
                ) : (
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={400}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    labelLine={true}
                                    label={({ name, percent }) => `${name} ${(percent! * 100).toFixed(0)}%`}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: any) => formatMoney(Number(value))} />
                                <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            <div className="table-section">
                <h3>{t('cash_movements')}</h3>
                <div className="table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>{t('date')}</th>
                                <th>{t('merchant')}</th>
                                <th>{t('category')}</th>
                                <th>{t('amount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cashMovements.map((movement) => (
                                <tr key={movement.id}>
                                    <td>{movement.date}</td>
                                    <td className="merchant-cell">
                                        <div className="logo-container">
                                            <div
                                                className="logo-fallback"
                                                style={{ backgroundColor: movement.color }}
                                            >
                                                {movement.label.charAt(0).toUpperCase()}
                                            </div>
                                        </div>
                                        <span>{movement.label}</span>
                                    </td>
                                    <td>
                                        <span
                                            className="category-badge"
                                            style={{ backgroundColor: `${movement.color}33`, color: movement.color }}
                                        >
                                            {movement.category}
                                        </span>
                                    </td>
                                    <td className={movement.amount >= 0 ? 'amount-cell positive' : 'amount-cell negative'}>
                                        {movement.amount >= 0 ? '+' : '-'}{formatMoney(Math.abs(movement.amount))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
