import { Transaction } from '../model/transaction.js';
import database from '../db/index.js';
import { Op } from 'sequelize';

export async function processSubscriptions() {
    console.log('--- Processando Assinaturas Recorrentes (Tabela Única) ---');
    const now = new Date();

    const templates = await Transaction.findAll({
        where: {
            type: 'subscription',
            isActive: true
        }
    });

    for (const sub of templates) {
        let shouldGenerate = false;

        if (!sub.lastGenerated) {
            shouldGenerate = true;
        } else {
            const lastDate = new Date(sub.lastGenerated);

            if (sub.frequency === 'monthly') {
                const nextMonth = new Date(lastDate);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                if (now >= nextMonth) shouldGenerate = true;
            }
            else if (sub.frequency === 'annual') {
                const nextYear = new Date(lastDate);
                nextYear.setFullYear(nextYear.getFullYear() + 1);
                if (now >= nextYear) shouldGenerate = true;
            }
        }

        if (shouldGenerate) {
            console.log(`Gerando lançamento real para assinatura: ${sub.description}`);

            const transactionSequelize = await database.sequelize.transaction();
            try {
                await Transaction.create({
                    type: 'expense',
                    date: new Date(),
                    value: sub.value,
                    description: `[ASSINATURA] ${sub.description}`,
                    person: sub.person,
                    category: sub.category || 'contas'
                }, { transaction: transactionSequelize });

                sub.lastGenerated = new Date();
                await sub.save({ transaction: transactionSequelize });

                await transactionSequelize.commit();
            } catch (error) {
                await transactionSequelize.rollback();
                console.error(`Erro transacional ao processar assinatura "${sub.description}":`, error);
            }
        }
    }
}

export default { processSubscriptions };
