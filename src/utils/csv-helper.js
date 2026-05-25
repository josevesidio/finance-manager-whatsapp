/**
 * Gera uma string formatada em CSV para as transações de um usuário em um determinado mês e ano.
 * 
 * @param {Array} transacoes Lista de transações carregadas do banco de dados
 * @param {string} nomeUsuario Nome do usuário
 * @param {number} mes Mês de referência (1-12)
 * @param {number} ano Ano de referência (quatro dígitos)
 * @returns {string} String do arquivo CSV codificada com BOM UTF-8
 */
export function gerarCsvTransacoes(transacoes, nomeUsuario, mes, ano) {
    const colunas = ['Data', 'Responsável', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)'];
    const linhas = [];
    
    // Adiciona cabeçalho com informações das colunas usando ";" como delimitador BR
    linhas.push(colunas.join(';'));
    
    transacoes.forEach(t => {
        const dataStr = new Date(t.date).toLocaleDateString('pt-BR');
        
        let tipoStr = 'Saída';
        if (t.type === 'entrada') {
            tipoStr = 'Entrada';
        } else if (t.type === 'parcelado') {
            tipoStr = `Saída (Parcelado - Parcela ${t.actuallyParcel}/${t.totalParcel})`;
        }
        
        const valor = t.type === 'parcelado' ? t.valuePerMonth : t.value;
        const valorBr = valor.toFixed(2).replace('.', ',');
        
        // Escapa aspas duplas de descrições duplicando-as
        const desc = t.description ? t.description.replace(/"/g, '""') : '';
        const cat = t.category || 'outros';
        const responsavel = t.person || 'N/A';
        
        // Constrói a linha escapando campos de texto e usando ";"
        linhas.push([
            `"${dataStr}"`,
            `"${responsavel}"`,
            `"${tipoStr}"`,
            `"${desc}"`,
            `"${cat}"`,
            `"${valorBr}"`
        ].join(';'));
    });
    
    // Retorna com o BOM UTF-8 (\ufeff) no início para forçar o Excel a abrir com codificação correta
    return '\ufeff' + linhas.join('\n');
}

export default { gerarCsvTransacoes };
