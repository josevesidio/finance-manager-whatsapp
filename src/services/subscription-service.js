import { Transaction } from '../model/transaction.js';
import database from '../db/index.js';
import { Op } from 'sequelize';

export async function processarAssinaturas() {
    console.log('--- Processando Assinaturas Recorrentes (Tabela Única) ---');
    const agora = new Date();
    
    // Busca registros que são do tipo 'assinatura' e estão ativos
    const templates = await Transaction.findAll({ 
        where: { 
            type: 'assinatura',
            isActive: true 
        } 
    });

    for (const sub of templates) {
        let deveGerar = false;
        
        // Se nunca foi gerada, gera agora se a data de criação já passou ou é hoje
        if (!sub.lastGenerated) {
            deveGerar = true;
        } else {
            const ultimaData = new Date(sub.lastGenerated);
            
            if (sub.frequency === 'mensal') {
                const proximoMes = new Date(ultimaData);
                proximoMes.setMonth(proximoMes.getMonth() + 1);
                if (agora >= proximoMes) deveGerar = true;
            } 
            else if (sub.frequency === 'anual') {
                const proximoAno = new Date(ultimaData);
                proximoAno.setFullYear(proximoAno.getFullYear() + 1);
                if (agora >= proximoAno) deveGerar = true;
            }
        }

        if (deveGerar) {
            console.log(`Gerando lançamento real para assinatura: ${sub.description}`);
            
            const transactionSequelize = await database.sequelize.transaction();
            try {
                // Cria um lançamento real do tipo 'saida'
                await Transaction.create({
                    type: 'saida',
                    date: new Date(),
                    value: sub.value,
                    description: `[ASSINATURA] ${sub.description}`,
                    person: sub.person,
                    category: sub.category || 'contas'
                }, { transaction: transactionSequelize });

                // Atualiza o registro template com a data da última geração
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

export default { processarAssinaturas };
