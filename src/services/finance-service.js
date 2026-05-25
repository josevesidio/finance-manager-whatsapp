import { Transaction } from '../model/transaction.js';
import { User } from '../model/user.js';
import { Op } from 'sequelize';

export async function registerIncome(name, value, description, category = 'outros') {
    return await Transaction.create({
        type: 'income',
        date: new Date(),
        value: value || 0,
        description: description || '',
        person: name,
        category: category
    });
}

export async function registerExpense(name, value, description, category = 'outros', extras = {}) {
    return await Transaction.create({
        type: 'expense',
        date: new Date(),
        value: value || 0,
        description: description || '',
        person: name,
        category: category,
        isSplit: extras.isSplit || false,
        originalValue: extras.originalValue || null
    });
}

export async function registerInstallment(name, totalValue, installmentValue, totalInstallments, description, currentInstallmentReceived, category = 'outros') {
    const transactions = [];
    const installments = totalInstallments || 1;
    const initialInstallment = currentInstallmentReceived || 1;
    const currentDate = new Date();

    for (let i = initialInstallment; i <= installments; i++) {
        const installmentDate = new Date(currentDate);
        installmentDate.setMonth(currentDate.getMonth() + (i - initialInstallment));

        transactions.push({
            type: 'installment',
            date: installmentDate,
            value: totalValue || 0,
            valuePerMonth: installmentValue || 0,
            actuallyParcel: i,
            totalParcel: installments,
            description: `${description} (${i}/${installments})`,
            person: name,
            category: category
        });
    }

    return await Transaction.bulkCreate(transactions);
}

export async function registerSubscription(name, value, description, frequency = 'monthly', category = 'contas') {
    return await Transaction.create({
        type: 'subscription',
        date: new Date(),
        value: value || 0,
        description: description || '',
        person: name,
        frequency: frequency,
        category: category,
        isActive: true
    });
}

export async function registerSplit(requesterName, totalValue, description, peopleList, category = 'outros') {
    const totalPeople = peopleList.length;
    if (totalPeople === 0) return [];

    const individualValue = parseFloat((totalValue / totalPeople).toFixed(2));
    const transactions = [];

    for (const person of peopleList) {
        const finalName = (person.toLowerCase() === 'eu' || person.toLowerCase() === 'mim') ? requesterName : person;

        transactions.push({
            type: 'expense',
            date: new Date(),
            value: individualValue,
            description: `[DIVISÃO] ${description}`,
            person: finalName,
            category: category,
            isSplit: true,
            originalValue: totalValue
        });
    }

    return await Transaction.bulkCreate(transactions);
}

export async function getMonthlySummary(userName, month = null, year = null) {
    const now = new Date();
    const y = year !== null ? parseInt(year, 10) : now.getFullYear();
    const m = month !== null ? parseInt(month, 10) - 1 : now.getMonth();

    const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);

    const transactions = await Transaction.findAll({
        where: {
            person: userName,
            type: { [Op.ne]: 'subscription' },
            date: {
                [Op.between]: [monthStart, monthEnd]
            }
        }
    });

    let totalIncome = 0;
    let totalExpenses = 0;
    const categories = {};

    transactions.forEach(t => {
        if (t.type === 'income') {
            totalIncome += t.value;
        } else {
            const spentValue = t.type === 'installment' ? t.valuePerMonth : t.value;
            totalExpenses += spentValue;

            const cat = t.category || 'outros';
            categories[cat] = (categories[cat] || 0) + spentValue;
        }
    });

    const user = await User.findOne({ where: { name: userName } });
    const spendingLimit = user ? user.spendingLimit : null;
    let limitPercentage = null;

    if (spendingLimit && spendingLimit > 0) {
        limitPercentage = parseFloat(((totalExpenses / spendingLimit) * 100).toFixed(1));
    }

    return {
        income: totalIncome,
        expenses: totalExpenses,
        balance: totalIncome - totalExpenses,
        categories,
        spendingLimit,
        limitPercentage
    };
}

export async function getMonthlyTransactions(month = null, year = null) {
    const now = new Date();
    const y = year !== null ? parseInt(year, 10) : now.getFullYear();
    const m = month !== null ? parseInt(month, 10) - 1 : now.getMonth();

    const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);

    return await Transaction.findAll({
        where: {
            type: { [Op.ne]: 'subscription' },
            date: {
                [Op.between]: [monthStart, monthEnd]
            }
        },
        order: [['date', 'ASC']]
    });
}

export async function findRecentTransactions(searchTerm, limit = 5, includeSubscriptions = false) {
    const where = {};
    if (searchTerm) {
        where.description = { [Op.like]: `%${searchTerm}%` };
    }

    if (!includeSubscriptions) {
        where.type = { [Op.ne]: 'subscription' };
    }

    return await Transaction.findAll({
        where,
        order: [['date', 'DESC']],
        limit: limit
    });
}

export async function findActiveSubscriptionByDescription(name, description) {
    return await Transaction.findOne({
        where: {
            person: name,
            type: 'subscription',
            isActive: true,
            description: { [Op.like]: `%${description}%` }
        }
    });
}

export async function deactivateSubscription(name, description) {
    const subscription = await findActiveSubscriptionByDescription(name, description);
    if (!subscription) return null;

    subscription.isActive = false;
    await subscription.save();
    return subscription;
}

export async function updateTransaction(id, data) {
    return await Transaction.update(data, {
        where: { id }
    });
}

export default {
    registerIncome,
    registerExpense,
    registerInstallment,
    findRecentTransactions,
    updateTransaction,
    registerSubscription,
    registerSplit,
    getMonthlySummary,
    getMonthlyTransactions,
    findActiveSubscriptionByDescription,
    deactivateSubscription
};
