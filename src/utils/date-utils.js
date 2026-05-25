/**
 * Parseia uma string de texto contendo informações de mês/ano e retorna um objeto estruturado.
 * Suporta formatos como:
 * - "mês passado", "mes passado"
 * - "este mês", "atual"
 * - "MM/AAAA", "MM/AA", "MM-AAAA", "MM-AA", "MM" (apenas o número do mês)
 * - Nomes de meses em português (ex: "janeiro", "maio", "maio de 2026")
 * 
 * @param {string} texto O texto contendo a data a ser interpretada
 * @returns {{ mes: number, ano: number }} Objeto contendo o mês (1-12) e o ano (quatro dígitos)
 */
export function parsearMesAno(texto) {
    if (!texto) {
        const agora = new Date();
        return { mes: agora.getMonth() + 1, ano: agora.getFullYear() };
    }

    const agora = new Date();
    const textoLimpo = texto.trim().toLowerCase();

    // Casos especiais
    if (textoLimpo === 'mês passado' || textoLimpo === 'mes passado') {
        const dataRef = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
        return { mes: dataRef.getMonth() + 1, ano: dataRef.getFullYear() };
    }
    if (textoLimpo === 'este mês' || textoLimpo === 'este mes' || textoLimpo === 'atual' || textoLimpo === 'hoje') {
        return { mes: agora.getMonth() + 1, ano: agora.getFullYear() };
    }

    // Tenta formato MM/AAAA ou MM/AA ou MM-AAAA ou MM-AA
    const regexBarra = /^(\d{1,2})[/-](\d{2,4})$/;
    const matchBarra = textoLimpo.match(regexBarra);
    if (matchBarra) {
        let mes = parseInt(matchBarra[1], 10);
        let ano = parseInt(matchBarra[2], 10);
        if (ano < 100) {
            ano += 2000; // se informar ex: 26, vira 2026
        }
        if (mes >= 1 && mes <= 12) {
            return { mes, ano };
        }
    }

    // Tenta apenas o número do mês (se for um número isolado entre 1 e 12)
    const regexNumeroUnico = /^(\d{1,2})$/;
    const matchNumero = textoLimpo.match(regexNumeroUnico);
    if (matchNumero) {
        const mes = parseInt(matchNumero[1], 10);
        if (mes >= 1 && mes <= 12) {
            return { mes, ano: agora.getFullYear() };
        }
    }

    // Tenta nome do mês em português
    const mesesMap = {
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

    // Vemos se o texto contém algum dos meses do map
    for (const key of Object.keys(mesesMap)) {
        if (textoLimpo.includes(key)) {
            // Verifica se tem ano mencionado no texto (ex: "maio de 2026" ou "maio 2026" ou "maio 26")
            const matchAno = textoLimpo.match(/\b(20\d{2}|\d{2})\b/);
            let ano = agora.getFullYear();
            if (matchAno) {
                const anoParsed = parseInt(matchAno[1], 10);
                ano = anoParsed < 100 ? 2000 + anoParsed : anoParsed;
            }
            return { mes: mesesMap[key], ano };
        }
    }

    // Se não reconheceu, assume o mês atual
    return { mes: agora.getMonth() + 1, ano: agora.getFullYear() };
}

export default { parsearMesAno };
