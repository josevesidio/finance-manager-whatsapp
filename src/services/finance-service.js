import { Transaction } from '../model/transaction.js';
import { User } from '../model/user.js';
import { Op } from 'sequelize';

export async function registrarEntrada(nome, valor, descricao, categoria = 'outros') {
    return await Transaction.create({
        type: 'entrada',
        date: new Date(),
        value: valor || 0,
        description: descricao || '',
        person: nome,
        category: categoria
    });
}

export async function registrarSaida(nome, valor, descricao, categoria = 'outros', extras = {}) {
    return await Transaction.create({
        type: 'saida',
        date: new Date(),
        value: valor || 0,
        description: descricao || '',
        person: nome,
        category: categoria,
        isSplit: extras.isSplit || false,
        originalValue: extras.originalValue || null
    });
}

export async function registrarParcelado(nome, valorTotal, valorParcela, totalParcelas, descricao, parcelaAtualRecebida, categoria = 'outros') {
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
            description: `${descricao} (${i}/${parcelas})`,
            person: nome,
            category: categoria
        });
    }

    return await Transaction.bulkCreate(transactions);
}

export async function registrarAssinatura(nome, valor, descricao, frequencia = 'mensal', categoria = 'contas') {
    return await Transaction.create({
        type: 'assinatura',
        date: new Date(),
        value: valor || 0,
        description: descricao || '',
        person: nome,
        frequency: frequencia,
        category: categoria,
        isActive: true
    });
}

export async function registrarDivisao(nomeSolicitante, valorTotal, descricao, listaPessoas, categoria = 'outros') {
    const totalPessoas = listaPessoas.length;
    if (totalPessoas === 0) return [];
    
    const valorIndividual = parseFloat((valorTotal / totalPessoas).toFixed(2));
    const transacoes = [];

    for (const pessoa of listaPessoas) {
        // Se a pessoa for "mim" ou "eu", assume o nome do solicitante
        const nomeFinal = (pessoa.toLowerCase() === 'eu' || pessoa.toLowerCase() === 'mim') ? nomeSolicitante : pessoa;
        
        transacoes.push({
            type: 'saida',
            date: new Date(),
            value: valorIndividual,
            description: `[DIVISÃO] ${descricao}`,
            person: nomeFinal,
            category: categoria,
            isSplit: true,
            originalValue: valorTotal
        });
    }

    return await Transaction.bulkCreate(transacoes);
}

export async function obterResumoMensal(nomeUsuario) {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
    const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);

    // 1. Busca todas as transações do usuário no mês atual (exceto templates de assinaturas)
    const transacoes = await Transaction.findAll({
        where: {
            person: nomeUsuario,
            type: { [Op.ne]: 'assinatura' },
            date: {
                [Op.between]: [inicioMes, fimMes]
            }
        }
    });

    let totalEntradas = 0;
    let totalSaidas = 0;
    const categorias = {};

    transacoes.forEach(t => {
        if (t.type === 'entrada') {
            totalEntradas += t.value;
        } else {
            // Para saídas normais ou parcelas do mês
            const valorGasto = t.type === 'parcelado' ? t.valuePerMonth : t.value;
            totalSaidas += valorGasto;

            // Agrupa por categoria
            const cat = t.category || 'outros';
            categorias[cat] = (categorias[cat] || 0) + valorGasto;
        }
    });

    // 2. Busca o limite de gastos cadastrado para o usuário
    const usuario = await User.findOne({ where: { nome: nomeUsuario } });
    const limiteGastos = usuario ? usuario.limiteGastos : null;
    let porcentagemLimite = null;
    
    if (limiteGastos && limiteGastos > 0) {
        porcentagemLimite = parseFloat(((totalSaidas / limiteGastos) * 100).toFixed(1));
    }

    return {
        entradas: totalEntradas,
        saidas: totalSaidas,
        saldo: totalEntradas - totalSaidas,
        categorias,
        limiteGastos,
        porcentagemLimite
    };
}

export async function buscarUltimosLancamentos(termoBusca, limite = 5, incluirAssinaturas = false) {
    const where = {};
    if (termoBusca) {
        where.description = { [Op.like]: `%${termoBusca}%` };
    }
    
    if (!incluirAssinaturas) {
        where.type = { [Op.ne]: 'assinatura' };
    }

    return await Transaction.findAll({
        where,
        order: [['date', 'DESC']],
        limit: limite
    });
}

export async function buscarAssinaturaAtivaPorDescricao(nome, descricao) {
    return await Transaction.findOne({
        where: {
            person: nome,
            type: 'assinatura',
            isActive: true,
            description: { [Op.like]: `%${descricao}%` }
        }
    });
}

export async function desativarAssinatura(nome, descricao) {
    const assinatura = await buscarAssinaturaAtivaPorDescricao(nome, descricao);
    if (!assinatura) return null;
    
    assinatura.isActive = false;
    await assinatura.save();
    return assinatura;
}

export async function atualizarLancamento(id, dados) {
    return await Transaction.update(dados, {
        where: { id }
    });
}

export default { 
    registrarEntrada, 
    registrarSaida, 
    registrarParcelado,
    buscarUltimosLancamentos,
    atualizarLancamento,
    registrarAssinatura,
    registrarDivisao,
    obterResumoMensal,
    buscarAssinaturaAtivaPorDescricao,
    desativarAssinatura
};
