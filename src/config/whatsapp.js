import whatsapp from 'whatsapp-web.js';
const { LocalAuth } = whatsapp;

export const authStrategy = new LocalAuth();

export default {
    authStrategy,
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
}
