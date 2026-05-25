/**
 * Generates a CSV string for a user's transactions in a given month and year.
 *
 * @param {Array} transactions List of transactions loaded from the database
 * @param {string} userName User name
 * @param {number} month Reference month (1-12)
 * @param {number} year Reference year (four digits)
 * @returns {string} CSV string encoded with UTF-8 BOM
 */
export function generateTransactionsCsv(transactions, userName, month, year) {
    const columns = ['Data', 'Responsável', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)'];
    const rows = [];

    rows.push(columns.join(';'));

    transactions.forEach(t => {
        const dateStr = new Date(t.date).toLocaleDateString('pt-BR');

        let typeLabel = 'Saída';
        if (t.type === 'income') {
            typeLabel = 'Entrada';
        } else if (t.type === 'installment') {
            typeLabel = `Saída (Parcelado - Parcela ${t.actuallyParcel}/${t.totalParcel})`;
        }

        const amount = t.type === 'installment' ? t.valuePerMonth : t.value;
        const amountBr = amount.toFixed(2).replace('.', ',');

        const desc = t.description ? t.description.replace(/"/g, '""') : '';
        const cat = t.category || 'outros';
        const responsible = t.person || 'N/A';

        rows.push([
            `"${dateStr}"`,
            `"${responsible}"`,
            `"${typeLabel}"`,
            `"${desc}"`,
            `"${cat}"`,
            `"${amountBr}"`
        ].join(';'));
    });

    return '\ufeff' + rows.join('\n');
}

export default { generateTransactionsCsv };
