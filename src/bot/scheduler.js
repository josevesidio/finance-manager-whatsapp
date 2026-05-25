import cron from 'node-cron';
import client from '../utils/client.js';
import { processarAssinaturas } from '../services/subscription-service.js';
import { buscarLembretesDoDia } from '../services/reminder-service.js';
import { User } from '../model/user.js';

export function iniciarAgendamentos() {
    console.log('Iniciando agendador de tarefas recorrentes...');

    // 1. Roda a cada 1 hora para verificar assinaturas
    // '0 * * * *' -> No minuto 0 de cada hora
    cron.schedule('0 * * * *', async () => {
        try {
            await processarAssinaturas();
        } catch (error) {
            console.error('Erro ao processar assinaturas no cron:', error);
        }
    });

    // 2. Roda todos os dias às 08:00 da manhã para enviar lembretes de contas
    // '0 8 * * *' -> Minuto 0, Hora 8, todos os dias
    cron.schedule('0 8 * * *', async () => {
        try {
            await dispararLembretesDiarios();
        } catch (error) {
            console.error('Erro ao disparar lembretes diários:', error);
        }
    });

    // Roda uma vez na inicialização (somente assinaturas)
    processarAssinaturas().catch(err => console.error('Erro na primeira execução das assinaturas:', err));
}

// Busca lembretes que vencem no dia e notifica o respectivo usuário
async function dispararLembretesDiarios() {
    const diaHoje = new Date().getDate();
    console.log(`Verificando lembretes de contas para o dia ${diaHoje}...`);
    
    const lembretes = await buscarLembretesDoDia(diaHoje);
    if (lembretes.length === 0) {
        console.log('Nenhum lembrete de conta agendado para hoje.');
        return;
    }

    for (const lembrete of lembretes) {
        // Tenta achar o whatsappId do usuário correspondente
        const usuario = await User.findOne({ where: { nome: lembrete.person } });
        
        const valorFormatado = lembrete.value.toFixed(2);
        const msg = `⚠️ *Lembrete de Conta a Vencer Hoje!*\n\n` +
                    `👤 Responsável: *${lembrete.person}*\n` +
                    `📝 Conta: *${lembrete.description}*\n` +
                    `💰 Valor: *R$ ${valorFormatado}*\n` +
                    `📅 Vencimento: Todo dia ${lembrete.dueDate}\n\n` +
                    `_Para marcar como paga e registrá-la nos seus gastos, envie: *!pago ${lembrete.id}*_`;

        if (usuario && usuario.whatsappId) {
            await client.sendMessage(usuario.whatsappId, msg);
            console.log(`Lembrete enviado para o usuário: ${lembrete.person}`);
        } else if (process.env.CHAT_MONITORIN) {
            // Se o usuário não estiver cadastrado com número direto, envia no primeiro canal monitorado configurado
            const canalPrincipal = process.env.CHAT_MONITORIN.split(',')[0];
            await client.sendMessage(canalPrincipal, msg);
            console.log(`Lembrete de ${lembrete.person} enviado para o canal monitorado principal.`);
        }
    }
}

export default { iniciarAgendamentos };
