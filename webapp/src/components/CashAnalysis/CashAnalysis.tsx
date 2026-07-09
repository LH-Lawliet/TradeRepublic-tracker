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
    LabelList
} from 'recharts';
import type { Transaction } from '../../logic/types';
import { processCashTransactions, type ExpenseRecord, type MonthlyExpenseChartData } from '../../logic/cash';
import { t } from '../../i18n/config';
import './CashAnalysis.css';

interface Props {
    transactions: Transaction[];
}

export default function CashAnalysis({ transactions }: Props) {
    const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
    const [chartData, setChartData] = useState<MonthlyExpenseChartData[]>([]);
    const [uniqueCategories, setUniqueCategories] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

    useEffect(() => {
        let isMounted = true;

        async function loadData() {
            setIsLoading(true);
            const data = await processCashTransactions(transactions);
            if (isMounted) {
                setExpenses(data.expenses);
                setChartData(data.chartData);
                setUniqueCategories(data.uniqueCategories);
                setIsLoading(false);
            }
        }

        loadData();
        return () => { isMounted = false; };
    }, [transactions]);

    const handleImageError = (id: string) => {
        setImageErrors(prev => ({ ...prev, [id]: true }));
    };

    if (isLoading) {
        return <div className="cash-container"><p>{t('cash_loading')}</p></div>;
    }

    if (expenses.length === 0) {
        return <div className="cash-container"><p>{t('cash_no_data')}</p></div>;
    }

    // Calculate total spent per category to determine sorting order
    const categoryTotals = expenses.reduce((acc, exp) => {
        acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
        return acc;
    }, {} as Record<string, number>);

    const sortedCategories = [...uniqueCategories].sort(
        (a, b) => (categoryTotals[b] || 0) - (categoryTotals[a] || 0)
    );

    // Calculate the total for each month to use for the top label
    const chartDataWithTotals = chartData.map(monthData => {
        const monthTotal = sortedCategories.reduce(
            (sum, cat) => sum + (Number(monthData[cat]) || 0),
            0
        );
        return { ...monthData, monthTotal };
    });

    return (
        <div className="cash-container">
            <header className="cash-header">
                <h2>{t('expense_analysis')}</h2>
                <div className="stats">
                    {t('total_tracked')}: €{expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}
                </div>
            </header>

            <div className="chart-section">
                <h3>{t('monthly_spending')}</h3>
                <div className="chart-wrapper">
                    <ResponsiveContainer width="100%" height="100%">
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
                                tickFormatter={(val) => `€${val}`}
                            />
                            <Tooltip
                                shared={false}
                                formatter={(value: any) => `€${Number(value).toFixed(2)}`}
                            />
                            <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8' }} />

                            {/* Render the stacked bars normally, no labels attached to them */}
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

                            {/* Invisible Line that floats perfectly at the top of the stack to hold the labels */}
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
                                    formatter={(val: any) => {
                                        const num = Number(val);
                                        return num > 0 ? `€${num.toFixed(2)}` : '';
                                    }}
                                />
                            </Line>
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="table-section">
                <h3>{t('trade_history')}</h3>
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
                            {expenses.map((exp) => (
                                <tr key={exp.id}>
                                    <td>{exp.date}</td>
                                    <td className="merchant-cell">
                                        <div className="logo-container">
                                            {!imageErrors[exp.id] && exp.logoUrl ? (
                                                <img
                                                    src={exp.logoUrl}
                                                    alt="logo"
                                                    onError={() => handleImageError(exp.id)}
                                                />
                                            ) : (
                                                <div
                                                    className="logo-fallback"
                                                    style={{ backgroundColor: exp.color }}
                                                >
                                                    {exp.merchant.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <span>{exp.merchant}</span>
                                    </td>
                                    <td>
                                        <span
                                            className="category-badge"
                                            style={{ backgroundColor: `${exp.color}33`, color: exp.color }}
                                        >
                                            {exp.category}
                                        </span>
                                    </td>
                                    <td className="amount-cell">€{exp.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}