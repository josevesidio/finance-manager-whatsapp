import { classifyMessage } from '../../services/gemini-service.js';
import { getUserName, createUser } from '../../services/user-service.js';
import {
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
} from '../../services/finance-service.js';
import { parseMonthYear } from '../../utils/date-utils.js';
import { generateTransactionsCsv } from '../../utils/csv-helper.js';
import whatsapp from 'whatsapp-web.js';
const { MessageMedia } = whatsapp;
import {
    createReminder,
    listActiveReminders,
    markReminderPaid
} from '../../services/reminder-service.js';
import { User } from '../../model/user.js';
import { commandsHelp } from '../commands/help.js';

const awaitingName = new Map();
const awaitingSubscriptionConfirmation = new Map();
const botMessages = new Set();

async function replyAsBot(message, text) {
    const sentMessage = await message.reply(text);
    if (sentMessage && sentMessage.id) {
        botMessages.add(sentMessage.id._serialized);
    }
}

async function formatMonthlySummary(name, month = null, year = null) {
    const summary = await getMonthlySummary(name, month, year);

    const now = new Date();
    const y = year !== null ? parseInt(year, 10) : now.getFullYear();
    const m = month !== null ? parseInt(month, 10) - 1 : now.getMonth();
    const refDate = new Date(y, m, 1);
    const monthName = refDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    let text = `💰 *Resumo Financeiro - ${capitalizedMonthName}*\n👤 Usuário: *${name}*\n\n`;
    text += `🟢 *Entradas:* R$ ${summary.income.toFixed(2)}\n`;
    text += `🔴 *Saídas/Gastos:* R$ ${summary.expenses.toFixed(2)}\n`;

    const balanceEmoji = summary.balance >= 0 ? '🔵' : '⚠️';
    text += `${balanceEmoji} *Saldo:* R$ ${summary.balance.toFixed(2)}\n\n`;

    if (summary.spendingLimit) {
        text += `🎯 *Limite Mensal:* R$ ${summary.spendingLimit.toFixed(2)}\n`;
        text += `📊 *Uso do Limite:* ${summary.limitPercentage}%\n`;
        if (summary.limitPercentage >= 100) {
            text += `🚨 *Atenção! Você ultrapassou o limite em R$ ${(summary.expenses - summary.spendingLimit).toFixed(2)}!*\n`;
        } else if (summary.limitPercentage >= 80) {
            text += `⚠️ *Aviso: Você está próximo de atingir seu limite de gastos.*\n`;
        }
        text += `\n`;
    }

    text += `🗂️ *Gastos por Categoria:*\n`;
    const cats = Object.keys(summary.categories);
    if (cats.length === 0) {
        text += `_Nenhum gasto registrado ainda._`;
    } else {
        cats.forEach(c => {
            text += `- *${c.charAt(0).toUpperCase() + c.slice(1)}*: R$ ${summary.categories[c].toFixed(2)}\n`;
        });
    }

    return text;
}

async function formatFullReport(name, month = null, year = null) {
    const formattedSummary = await formatMonthlySummary(name, month, year);

    const transactions = await getMonthlyTransactions(month, year);

    const now = new Date();
    const y = year !== null ? parseInt(year, 10) : now.getFullYear();
    const m = month !== null ? parseInt(month, 10) - 1 : now.getMonth();
    const refDate = new Date(y, m, 1);
    const monthName = refDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    let text = formattedSummary + `\n📝 *Lançamentos de ${capitalizedMonthName}:*\n`;
    if (transactions.length === 0) {
        text += `_Nenhum lançamento encontrado para este período._`;
    } else {
        const displayLimit = transactions.slice(0, 15);
        displayLimit.forEach(t => {
            const dateStr = new Date(t.date).toLocaleDateString('pt-BR');
            const amount = t.type === 'installment' ? t.valuePerMonth : t.value;
            const sign = t.type === 'income' ? '🟢 +' : '🔴 -';
            text += `[${dateStr}] (${t.person || 'N/A'}) ${sign} R$ ${amount.toFixed(2)} - ${t.description} (${t.category || 'outros'})\n`;
        });
        if (transactions.length > 15) {
            text += `\n_... e mais ${transactions.length - 15} lançamentos. Para ver tudo, peça o resumo em CSV!_\n`;
        }
    }

    return text;
}

async function formatReminders(name) {
    const reminders = await listActiveReminders(name);
    let text = `📅 *Lembretes de Contas - ${name}*\n\n`;
    if (reminders.length === 0) {
        text += `_Você não tem lembretes de contas ativos._`;
    } else {
        reminders.forEach(r => {
            text += `📌 *Dia ${r.dueDate}*: ${r.description} - R$ ${r.value.toFixed(2)} _(ID: ${r.id})_\n`;
        });
        text += `\n_Para pagar uma conta, envie: *!pago [ID]*_`;
    }
    return text;
}

export default {
    name: 'message_create',
    async execute(message) {
        if (process.env.CHAT_MONITORIN && !process.env.CHAT_MONITORIN.split(',').includes(message.to)) {
            return;
        }

        const botEmojis = ['✅', '❌', '👋', '💰', '🛒', '💸', '💳', '📆', '🟢', '🔴', '⚠️', '🚨', '📌'];
        if (message.fromMe && botEmojis.some(emoji => message.body.startsWith(emoji))) {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        if (botMessages.has(message.id._serialized)) {
            botMessages.delete(message.id._serialized);
            return;
        }

        const senderId = message.author || message.from;
        if (!senderId) return;

        if (awaitingName.has(senderId)) {
            const providedName = message.body.trim();

            if (providedName.length < 2 || providedName.length > 50) {
                await replyAsBot(message, '❌ Nome inválido. Por favor, envie um nome válido (entre 2 e 50 caracteres).');
                return;
            }

            await createUser(senderId, providedName);

            const pendingData = awaitingName.get(senderId);
            awaitingName.delete(senderId);

            await replyAsBot(message, `✅ Prazer, *${providedName}*! Seu nome foi salvo.\nAgora vou processar sua mensagem anterior...`);

            await processMessage(pendingData.originalMessage, senderId, providedName, message);
            return;
        }

        const name = await getUserName(senderId);

        if (!name) {
            awaitingName.set(senderId, { originalMessage: message.body });
            await replyAsBot(message, '👋 Olá! Eu sou o *Finance Manager*.\nPara começar, me diz qual é o seu nome?');
        }

        if (awaitingSubscriptionConfirmation.has(senderId)) {
            const answer = message.body.trim().toLowerCase();
            const pendingData = awaitingSubscriptionConfirmation.get(senderId);

            if (answer === 'sim' || answer === 's') {
                awaitingSubscriptionConfirmation.delete(senderId);
                const result = pendingData.result;
                const category = result.category || 'contas';

                try {
                    await registerSubscription(name, result.value, result.description, result.frequency, category);
                    const valueStr = result.value ? `R$ ${result.value.toFixed(2)}` : 'não informado';
                    await replyAsBot(message, `✅ *Assinatura registrada com sucesso!*\n👤 Pessoa: ${name}\n📝 Descrição: ${result.description}\n🗂️ Categoria: ${category}\n💰 Valor: ${valueStr}\n📆 Recorrência: ${result.frequency || 'monthly'}\n📌 Os lançamentos serão automáticos a partir de agora!`);
                } catch (error) {
                    console.error('Erro ao registrar assinatura confirmada:', error);
                    await replyAsBot(message, '❌ Ocorreu um erro ao salvar o registro no banco de dados.');
                }
            } else if (answer === 'não' || answer === 'nao' || answer === 'n') {
                awaitingSubscriptionConfirmation.delete(senderId);
                await replyAsBot(message, '❌ *Cadastro de assinatura cancelado.*');
            } else {
                await replyAsBot(message, '❓ Resposta inválida. Por favor, responda apenas com *Sim* ou *Não* para confirmar a nova assinatura.');
            }
            return;
        }

        const messageText = message.body.trim();
        if (messageText.startsWith('!')) {
            const args = messageText.slice(1).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            if (command === 'commands' || command === 'ajuda') {
                const help = commandsHelp(message);
                await replyAsBot(message, help);
                return;
            }

            if (command === 'ping') {
                await replyAsBot(message, '✅ Pong! O bot está ativo e respondendo.');
                return;
            }

            if (command === 'resumo' || command === 'gastos') {
                const argText = args.join(' ');
                const { month, year } = parseMonthYear(argText);
                const summary = await formatMonthlySummary(name, month, year);
                await replyAsBot(message, summary);
                return;
            }

            if (command === 'relatorio') {
                const argText = args.join(' ');
                const { month, year } = parseMonthYear(argText);
                const report = await formatFullReport(name, month, year);
                await replyAsBot(message, report);
                return;
            }

            if (command === 'csv') {
                const argText = args.join(' ');
                const { month, year } = parseMonthYear(argText);

                try {
                    const transactions = await getMonthlyTransactions(month, year);
                    if (transactions.length === 0) {
                        const refDate = new Date(year, month - 1, 1);
                        const monthName = refDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                        await replyAsBot(message, `🗂️ Não foram encontrados lançamentos para o período de *${monthName.charAt(0).toUpperCase() + monthName.slice(1)}*.`);
                        return;
                    }

                    const csvString = generateTransactionsCsv(transactions, name, month, year);
                    const base64Data = Buffer.from(csvString, 'utf-8').toString('base64');

                    const refDate = new Date(year, month - 1, 1);
                    const monthName = refDate.toLocaleDateString('pt-BR', { month: 'long' });
                    const filename = `resumo_${monthName.toLowerCase()}_${year}.csv`;

                    const media = new MessageMedia('text/csv', base64Data, filename);
                    await message.reply(media);
                } catch (err) {
                    console.error('Erro ao gerar CSV por comando:', err);
                    await replyAsBot(message, '❌ Ocorreu um erro ao gerar o arquivo CSV.');
                }
                return;
            }

            if (command === 'limite') {
                const limitValue = parseFloat(args[0]);
                if (isNaN(limitValue) || limitValue < 0) {
                    await replyAsBot(message, '❌ Uso correto: *!limite [valor]*\nExemplo: `!limite 1500`');
                    return;
                }
                const user = await User.findOne({ where: { whatsappId: senderId } });
                if (user) {
                    user.spendingLimit = limitValue;
                    await user.save();
                    await replyAsBot(message, `✅ *Limite de gastos mensal configurado:* R$ ${limitValue.toFixed(2)}`);
                } else {
                    await replyAsBot(message, '❌ Usuário não encontrado no sistema.');
                }
                return;
            }

            if (command === 'lembretes') {
                const remindersText = await formatReminders(name);
                await replyAsBot(message, remindersText);
                return;
            }

            if (command === 'pago') {
                const reminderId = parseInt(args[0]);
                if (isNaN(reminderId)) {
                    await replyAsBot(message, '❌ Uso correto: *!pago [ID_DO_LEMBRETE]*\nUse `!lembretes` para ver os IDs.');
                    return;
                }
                try {
                    const reminder = await markReminderPaid(reminderId);

                    await registerExpense(name, reminder.value, `[PAGO] ${reminder.description}`, 'contas');

                    await replyAsBot(message, `✅ *Lembrete pago com sucesso!*\nA conta "${reminder.description}" de R$ ${reminder.value.toFixed(2)} foi marcada como paga e registrada em seus gastos.`);
                } catch (err) {
                    await replyAsBot(message, `❌ Erro ao pagar lembrete: ${err.message}`);
                }
                return;
            }
        }

        await processMessage(message.body, senderId, name, message);
    }
};

async function processMessage(messageText, senderId, name, message) {
    const result = await classifyMessage(messageText);

    console.log('Classificação do Gemini:', result);

    if (result.type === 'error') {
        if (result.error === 'limit_exceeded') {
            await replyAsBot(message, '⚠️ *Limite de IA Atingido!*\n\nO limite de requisições do Gemini foi excedido temporariamente (cota diária ou por minuto). Por favor, tente novamente em alguns instantes ou use os comandos diretos (ex: `!resumo`, `!csv`, `!ajuda`).');
        } else {
            console.error('Erro desconhecido na classificação da IA:', result.message);
        }
        return;
    }

    if (result.type === 'irrelevant') {
        return;
    }

    let confirmation = '';

    try {
        if (result.type === 'income') {
            const category = result.category || 'outros';
            await registerIncome(name, result.value, result.description, category);
            const value = result.value ? `R$ ${result.value.toFixed(2)}` : 'valor não identificado';
            confirmation = `✅ *Entrada registrada!*\n👤 Pessoa: ${name}\n💰 Valor: ${value}\n📝 Descrição: ${result.description || 'não informada'}\n🗂️ Categoria: ${category}`;
        }
        else if (result.type === 'expense') {
            const category = result.category || 'outros';
            await registerExpense(name, result.value, result.description, category);
            const value = result.value ? `R$ ${result.value.toFixed(2)}` : 'valor não identificado';
            confirmation = `✅ *Saída registrada!*\n👤 Pessoa: ${name}\n💸 Valor: ${value}\n📝 Descrição: ${result.description || 'não informada'}\n🗂️ Categoria: ${category}`;

            const limitWarning = await checkSpendingLimitAlert(name);
            if (limitWarning) confirmation += `\n\n${limitWarning}`;
        }
        else if (result.type === 'installment') {
            const category = result.category || 'outros';
            await registerInstallment(name, result.totalValue, result.installmentValue, result.totalInstallments, result.description, result.currentInstallment, category);
            const totalValue = result.totalValue ? `R$ ${result.totalValue.toFixed(2)}` : 'não informado';
            const installmentValue = result.installmentValue ? `R$ ${result.installmentValue.toFixed(2)}` : 'não informado';
            confirmation = `✅ *Compra parcelada registrada!*\n👤 Pessoa: ${name}\n🛒 Descrição: ${result.description || 'não informada'}\n🗂️ Categoria: ${category}\n💳 Total: ${totalValue}\n📆 Parcelas: ${result.totalInstallments}x de ${installmentValue}\n📌 Começando na: ${result.currentInstallment || 1}ª parcela`;

            const limitWarning = await checkSpendingLimitAlert(name);
            if (limitWarning) confirmation += `\n\n${limitWarning}`;
        }
        else if (result.type === 'update') {
            const transactions = await findRecentTransactions(result.searchTerm, 5, true);

            if (transactions.length === 0) {
                confirmation = `❌ Não encontrei nenhum lançamento recente com "${result.searchTerm}" para alterar.`;
            } else {
                const last = transactions[0];
                const newData = {};
                if (result.newValue !== null) newData.value = result.newValue;
                if (result.newDescription !== null) newData.description = result.newDescription;
                if (result.newPerson !== null) newData.person = result.newPerson;

                if (Object.keys(newData).length === 0) {
                    confirmation = `❓ Não identifiquei o que você quer alterar no lançamento: "${last.description}".`;
                } else {
                    await updateTransaction(last.id, newData);
                    let prefix = last.type === 'subscription' ? '📌 *Assinatura alterada!*' : '✅ *Lançamento alterado!*';
                    confirmation = `${prefix}\n\n*De:* ${last.description} (R$ ${last.value.toFixed(2)})\n*Para:* ${newData.description || last.description} (R$ ${(newData.value || last.value).toFixed(2)})`;

                    if (last.type === 'subscription') {
                        confirmation += `\n\n_Note: Mudanças em assinaturas afetam apenas os próximos lançamentos automáticos._`;
                    }
                }
            }
        }
        else if (result.type === 'subscription') {
            const existingSubscription = await findActiveSubscriptionByDescription(name, result.description);

            if (existingSubscription) {
                awaitingSubscriptionConfirmation.set(senderId, { result, name });

                const existingValue = existingSubscription.value ? `R$ ${existingSubscription.value.toFixed(2)}` : 'não informado';
                const newValue = result.value ? `R$ ${result.value.toFixed(2)}` : 'não informado';

                confirmation = `⚠️ *Assinatura Duplicada Detectada!*\n\nVocê já possui uma assinatura ativa de *"${existingSubscription.description}"* no valor de *${existingValue}*.\n\nTem certeza que deseja adicionar uma nova assinatura de *"${result.description}"* por *${newValue}*?\n\nResponda apenas com *Sim* ou *Não*.`;
            } else {
                const category = result.category || 'contas';
                await registerSubscription(name, result.value, result.description, result.frequency, category);
                const value = result.value ? `R$ ${result.value.toFixed(2)}` : 'não informado';
                confirmation = `✅ *Assinatura registrada!*\n👤 Pessoa: ${name}\n📝 Descrição: ${result.description || 'não informada'}\n🗂️ Categoria: ${category}\n💰 Valor: ${value}\n📆 Recorrência: ${result.frequency || 'monthly'}\n📌 Os lançamentos serão automáticos a partir de agora!`;
            }
        }
        else if (result.type === 'cancellation') {
            const canceledSubscription = await deactivateSubscription(name, result.description);

            if (canceledSubscription) {
                confirmation = `✅ *Assinatura cancelada com sucesso!*\n\nA recorrência de *"${canceledSubscription.description}"* foi desativada e não gerará novos lançamentos automáticos.`;
            } else {
                confirmation = `❌ Não encontrei nenhuma assinatura ativa de *"${result.description}"* para cancelar.`;
            }
        }
        else if (result.type === 'split') {
            const category = result.category || 'lazer';
            const people = result.people || [];

            await registerSplit(name, result.totalValue, result.description, people, category);
            const individualValue = (result.totalValue / people.length).toFixed(2);
            confirmation = `✅ *Divisão de despesa registrada!*\n👤 Solicitante: ${name}\n🛒 Descrição: ${result.description || 'não informada'}\n💰 Total: R$ ${result.totalValue.toFixed(2)}\n👥 Divisão entre: ${people.join(', ')}\n💸 Valor para cada: R$ ${individualValue}`;
        }
        else if (result.type === 'limit') {
            const user = await User.findOne({ where: { whatsappId: senderId } });
            if (user) {
                user.spendingLimit = result.value;
                await user.save();
                confirmation = `✅ *Limite de gastos mensal configurado:* R$ ${result.value.toFixed(2)}`;
            } else {
                confirmation = `❌ Usuário não encontrado no sistema.`;
            }
        }
        else if (result.type === 'reminder') {
            await createReminder(name, result.value, result.description, result.dueDay);
            confirmation = `✅ *Lembrete agendado com sucesso!*\n👤 Pessoa: ${name}\n📝 Conta: ${result.description}\n💰 Valor: R$ ${result.value.toFixed(2)}\n📆 Vencimento: Todo dia ${result.dueDay}\n📌 Eu avisarei no chat na manhã do vencimento.`;
        }
        else if (result.type === 'report') {
            const month = result.month;
            const year = result.year;

            if (result.format === 'csv') {
                const period = parseMonthYear(month && year ? `${month}/${year}` : (month ? `${month}` : null));
                const transactions = await getMonthlyTransactions(period.month, period.year);

                const refDate = new Date(period.year, period.month - 1, 1);
                const monthName = refDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);

                if (transactions.length === 0) {
                    confirmation = `🗂️ Não foram encontrados lançamentos para o período de *${capitalizedMonthName}* para gerar o CSV.`;
                } else {
                    try {
                        const csvString = generateTransactionsCsv(transactions, name, period.month, period.year);
                        const base64Data = Buffer.from(csvString, 'utf-8').toString('base64');
                        const filename = `resumo_${refDate.toLocaleDateString('pt-BR', { month: 'long' }).toLowerCase()}_${period.year}.csv`;

                        const media = new MessageMedia('text/csv', base64Data, filename);
                        await message.reply(media);
                        confirmation = `📊 Aqui está o seu relatório em CSV referente a *${capitalizedMonthName}*!`;
                    } catch (csvErr) {
                        console.error('Erro ao gerar CSV via IA:', csvErr);
                        confirmation = '❌ Desculpe, ocorreu um erro técnico ao gerar o seu arquivo CSV.';
                    }
                }
            } else {
                const period = parseMonthYear(month && year ? `${month}/${year}` : (month ? `${month}` : null));
                confirmation = await formatFullReport(name, period.month, period.year);
            }
        }

        await replyAsBot(message, confirmation);
    } catch (error) {
        console.error('Erro ao registrar no banco de dados:', error);
        await replyAsBot(message, '❌ Ocorreu um erro ao salvar o registro no banco de dados.');
    }
}

async function checkSpendingLimitAlert(name) {
    const summary = await getMonthlySummary(name);
    if (!summary.spendingLimit) return null;

    if (summary.limitPercentage >= 100) {
        return `🚨 *ALERTA:* Você ultrapassou 100% do seu limite de gastos mensal! (Gasto: R$ ${summary.expenses.toFixed(2)} de R$ ${summary.spendingLimit.toFixed(2)})`;
    }
    if (summary.limitPercentage >= 80) {
        return `⚠️ *AVISO:* Você atingiu ${summary.limitPercentage}% do seu limite de gastos mensal! (Gasto: R$ ${summary.expenses.toFixed(2)} de R$ ${summary.spendingLimit.toFixed(2)})`;
    }
    return null;
}
