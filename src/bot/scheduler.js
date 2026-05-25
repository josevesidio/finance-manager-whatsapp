import cron from 'node-cron';
import { processarAssinaturas } from '../services/subscription-service.js';

export function iniciarAgendamentos() {
    console.log('Iniciando agendador de tarefas recorrentes...');

    // Roda a cada 1 hora para verificar assinaturas
    // '0 * * * *' -> No minuto 0 de cada hora
    cron.schedule('0 * * * *', async () => {
        try {
            await processarAssinaturas();
        } catch (error) {
            console.error('Erro ao processar assinaturas no cron:', error);
        }
    });

    // Roda uma vez na inicialização
    processarAssinaturas().catch(err => console.error('Erro na primeira execução das assinaturas:', err));
}

export default { iniciarAgendamentos };
