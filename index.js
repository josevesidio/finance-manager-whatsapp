import 'dotenv/config';
import startBot from './src/bot/index.js';
import model from './src/model/index.js';

model();
startBot();
