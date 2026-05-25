import cron from 'node-cron';
import client from '../utils/client.js';
import { processSubscriptions } from '../services/subscription-service.js';
import { findRemindersForDay } from '../services/reminder-service.js';
import { User } from '../model/user.js';

export function startSchedulers() {
    console.log('Iniciando agendador de tarefas recorrentes...');

    cron.schedule('0 * * * *', async () => {
        try {
            await processSubscriptions();
        } catch (error) {
            console.error('Erro ao processar assinaturas no cron:', error);
        }
    });

    cron.schedule('0 8 * * *', async () => {
        try {
            await dispatchDailyReminders();
        } catch (error) {
            console.error('Erro ao disparar lembretes diários:', error);
        }
    });

    processSubscriptions().catch(err => console.error('Erro na primeira execução das assinaturas:', err));
}

async function dispatchDailyReminders() {
    const todayDay = new Date().getDate();
    console.log(`Verificando lembretes de contas para o dia ${todayDay}...`);

    const reminders = await findRemindersForDay(todayDay);
    if (reminders.length === 0) {
        console.log('Nenhum lembrete de conta agendado para hoje.');
        return;
    }

    for (const reminder of reminders) {
        const user = await User.findOne({ where: { name: reminder.person } });

        const formattedValue = reminder.value.toFixed(2);
        const msg = `⚠️ *Lembrete de Conta a Vencer Hoje!*\n\n` +
                    `👤 Responsável: *${reminder.person}*\n` +
                    `📝 Conta: *${reminder.description}*\n` +
                    `💰 Valor: *R$ ${formattedValue}*\n` +
                    `📅 Vencimento: Todo dia ${reminder.dueDate}\n\n` +
                    `_Para marcar como paga e registrá-la nos seus gastos, envie: *!pago ${reminder.id}*_`;

        if (user && user.whatsappId) {
            await client.sendMessage(user.whatsappId, msg);
            console.log(`Lembrete enviado para o usuário: ${reminder.person}`);
        } else if (process.env.CHAT_MONITORIN) {
            const mainChannel = process.env.CHAT_MONITORIN.split(',')[0];
            await client.sendMessage(mainChannel, msg);
            console.log(`Lembrete de ${reminder.person} enviado para o canal monitorado principal.`);
        }
    }
}

export default { startSchedulers };
