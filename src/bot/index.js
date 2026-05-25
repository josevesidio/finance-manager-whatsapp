import client from '../utils/client.js';
import qrCode from 'qrcode-terminal';
import messageEvent from './events/message-event.js';
import { iniciarAgendamentos } from './scheduler.js';

client.on('loading_screen', (percent, message) => {
    console.log(`Carregando WhatsApp: ${percent}% - ${message}`);
});

client.on('authenticated', () => {
    console.log('Autenticado! Sessão carregada com sucesso.');
});

client.on('auth_failure', (msg) => {
    console.error('Falha na autenticação:', msg);
});

client.on('qr', qr => {
    console.log('QR Code gerado! Escaneie com o WhatsApp:');
    qrCode.generate(qr, { small: true });
});

client.on('disconnected', (reason) => {
    console.warn('Cliente desconectado! Motivo:', reason);
});

client.on('ready', () => {
    console.log('Cliente está pronto!');
});

client.on(messageEvent.name, messageEvent.execute);

export default function startBot() {
    console.log('Iniciando cliente WhatsApp...');
    client.initialize();
    iniciarAgendamentos();
}
