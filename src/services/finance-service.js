import { Transaction } from '../model/transaction.js';
import { Op } from 'sequelize';

export async function registrarEntrada(nome, valor, descricao) {
    return await Transaction.create({
        type: 'entrada',
        date: new Date(),
        value: valor || 0,
        description: descricao || '',
        person: nome
    });
}

export async function registrarSaida(nome, valor, descricao) {
    return await Transaction.create({
        type: 'saida',
        date: new Date(),
        value: valor || 0,
        description: descricao || '',
        person: nome
    });
}

export async function registrarParcelado(nome, valorTotal, valorParcela, totalParcelas, descricao, parcelaAtualRecebida) {
    const transactions = [];
    const parcelas = totalParcelas || 1;
    const parcelaInicial = parcelaAtualRecebida || 1;
    const dataAtual = new Date();

    for (let i = parcelaInicial; i <= parcelas; i++) {
        const dataParcela = new Date(dataAtual);
        dataParcela.setMonth(dataAtual.getMonth() + (i - parcelaInicial));

        transactions.push({
            type: 'parcelado',
            date: dataParcela,
            value: valorTotal || 0,
            valuePerMonth: valorParcela || 0,
            actuallyParcel: i,
            totalParcel: parcelas,
            description: descricao || '',
            person: nome
        });
    }

    return await Transaction.bulkCreate(transactions);
}

export async function buscarUltimosLancamentos(termoBusca, limite = 5, incluirAssinaturas = false) {
    const where = {};
    if (termoBusca) {
        where.description = { [Op.like]: `%${termoBusca}%` };
    }
    
    if (!incluirAssinaturas) {
        // Por padrão, ignora os templates de assinatura para não confundir com gastos reais
        where.type = { [Op.ne]: 'assinatura' };
    }

    return await Transaction.findAll({
        where,
        order: [['date', 'DESC']],
        limit: limite
    });
}

export async function atualizarLancamento(id, dados) {
    return await Transaction.update(dados, {
        where: { id }
    });
}

export async function registrarAssinatura(nome, valor, descricao, frequencia = 'mensal') {
    return await Transaction.create({
        type: 'assinatura',
        date: new Date(),
        value: valor || 0,
        description: descricao || '',
        person: nome,
        frequency: frequencia,
        isActive: true
    });
}

export default { 
    registrarEntrada, 
    registrarSaida, 
    registrarParcelado,
    buscarUltimosLancamentos,
    atualizarLancamento,
    registrarAssinatura
};
