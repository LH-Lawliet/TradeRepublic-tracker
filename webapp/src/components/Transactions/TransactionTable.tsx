import type { Transaction } from '../../logic/types';
import { t } from '../../i18n/config';
import './TransactionTable.css';

interface Props {
    transactions: Transaction[];
}

export default function TransactionTable({ transactions }: Props) {
    // Limit to prevent DOM freezing on massive datasets
    // removed for the moment, we will see if that cause issues
    // const displayData = transactions.slice(0, 100);
    const displayData = transactions;

    return (
        <div className="transaction-table-wrapper">
            <h2>{t('transactions_title')} ({transactions.length})</h2>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>{t('date')}</th>
                            <th>{t('type')}</th>
                            <th>{t('asset')}</th>
                            <th>{t('amount')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayData.map((tx, idx) => (
                            <tr key={idx}>
                                <td>{tx.date?.split('T')[0]}</td>
                                <td>{tx.type}</td>
                                <td>{tx.name || tx.symbol}</td>
                                <td>€{tx.amount?.toFixed(2) || '0.00'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}