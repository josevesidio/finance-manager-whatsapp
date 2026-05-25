/**
 * Parses a text string containing month/year information and returns a structured object.
 * Supports formats such as:
 * - "mês passado", "mes passado"
 * - "este mês", "atual"
 * - "MM/YYYY", "MM/YY", "MM-YYYY", "MM-YY", "MM" (month number only)
 * - Portuguese month names (e.g. "janeiro", "maio", "maio de 2026")
 *
 * @param {string} text The text containing the date to interpret
 * @returns {{ month: number, year: number }} Object with month (1-12) and year (four digits)
 */
export function parseMonthYear(text) {
    if (!text) {
        const now = new Date();
        return { month: now.getMonth() + 1, year: now.getFullYear() };
    }

    const now = new Date();
    const cleanText = text.trim().toLowerCase();

    if (cleanText === 'mês passado' || cleanText === 'mes passado') {
        const refDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return { month: refDate.getMonth() + 1, year: refDate.getFullYear() };
    }
    if (cleanText === 'este mês' || cleanText === 'este mes' || cleanText === 'atual' || cleanText === 'hoje') {
        return { month: now.getMonth() + 1, year: now.getFullYear() };
    }

    const slashRegex = /^(\d{1,2})[/-](\d{2,4})$/;
    const slashMatch = cleanText.match(slashRegex);
    if (slashMatch) {
        let month = parseInt(slashMatch[1], 10);
        let year = parseInt(slashMatch[2], 10);
        if (year < 100) {
            year += 2000;
        }
        if (month >= 1 && month <= 12) {
            return { month, year };
        }
    }

    const singleNumberRegex = /^(\d{1,2})$/;
    const numberMatch = cleanText.match(singleNumberRegex);
    if (numberMatch) {
        const month = parseInt(numberMatch[1], 10);
        if (month >= 1 && month <= 12) {
            return { month, year: now.getFullYear() };
        }
    }

    const monthsMap = {
        'janeiro': 1, 'jan': 1,
        'fevereiro': 2, 'fev': 2,
        'março': 3, 'marco': 3, 'mar': 3,
        'abril': 4, 'abr': 4,
        'maio': 5, 'mai': 5,
        'junho': 6, 'jun': 6,
        'julho': 7, 'jul': 7,
        'agosto': 8, 'ago': 8,
        'setembro': 9, 'set': 9,
        'outubro': 10, 'out': 10,
        'novembro': 11, 'nov': 11,
        'dezembro': 12, 'dez': 12
    };

    for (const key of Object.keys(monthsMap)) {
        if (cleanText.includes(key)) {
            const yearMatch = cleanText.match(/\b(20\d{2}|\d{2})\b/);
            let year = now.getFullYear();
            if (yearMatch) {
                const parsedYear = parseInt(yearMatch[1], 10);
                year = parsedYear < 100 ? 2000 + parsedYear : parsedYear;
            }
            return { month: monthsMap[key], year };
        }
    }

    return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export default { parseMonthYear };
