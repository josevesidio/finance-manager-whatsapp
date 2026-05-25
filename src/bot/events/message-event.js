import { classificarMensagem } from '../../services/gemini-service.js';
import { obterNomeUsuario, criarUsuario } from '../../services/user-service.js';
import { registrarEntrada, registrarSaida, registrarParcelado, buscarUltimosLancamentos, atualizarLancamento, registrarAssinatura } from '../../services/finance-service.js';

// Armazena os IDs que estão aguardando informar o nome
// Formato: { 'whatsappId': { mensagemOriginal: message.body } }
const aguardandoNome = new Map();

// Armazena os IDs das mensagens enviadas pelo bot para ignorá-las
const mensagensDoBot = new Set();

// Função auxiliar para enviar mensagem e rastrear o ID
async function responderBot(message, texto) {
    const msgEnviada = await message.reply(texto);
    if (msgEnviada && msgEnviada.id) {
        mensagensDoBot.add(msgEnviada.id._serialized);
    }
}

export default {
    name: 'message_create',
    async execute(message) {
        // Filtra apenas os chats monitorados (se configurado no .env)
        if (process.env.CHAT_MONITORIN && !process.env.CHAT_MONITORIN.split(',').includes(message.to)) {
            return;
        }

        // Espera 500ms para garantir que o objeto foi populado e o ID salvo no Set
        await new Promise(resolve => setTimeout(resolve, 500));

        // Ignora mensagens enviadas pelo bot (rastreadas por ID)
        if (mensagensDoBot.has(message.id._serialized)) {
            mensagensDoBot.delete(message.id._serialized);
            return;
        }

        // Filtro extra: se a mensagem é minha (fromMe) e começa com emojis do bot, ignora
        // Isso resolve o problema de quando o bot reinicia e perde o Set
        const botEmojis = ['✅', '❌', '👋', '💰', '🛒', '💸', '💳', '📆'];
        if (message.fromMe && botEmojis.some(emoji => message.body.startsWith(emoji))) {
            return;
        }

        // Pega o ID de quem enviou (em grupos usa author, em chat privado usa from)
        const remetenteId = message.author || message.from;
        if (!remetenteId) return;

        console.log('Mensagem recebida:', message.body, '| De:', remetenteId);

        // Se o usuário está respondendo com seu nome
        if (aguardandoNome.has(remetenteId)) {
            const nomeInformado = message.body.trim();

            if (nomeInformado.length < 2 || nomeInformado.length > 50) {
                await responderBot(message, '❌ Nome inválido. Por favor, envie um nome válido (entre 2 e 50 caracteres).');
                return;
            }

            await criarUsuario(remetenteId, nomeInformado);

            const dadosPendentes = aguardandoNome.get(remetenteId);
            aguardandoNome.delete(remetenteId);

            await responderBot(message, `✅ Prazer, *${nomeInformado}*! Seu nome foi salvo.\nAgora vou processar sua mensagem anterior...`);

            // Reprocessa a mensagem original que ficou pendente
            await processarMensagem(dadosPendentes.mensagemOriginal, remetenteId, nomeInformado, message);
            return;
        }

        // Tenta obter o nome do usuário
        const nome = await obterNomeUsuario(remetenteId);

        if (!nome) {
            // Não encontrou nome em nenhum lugar, pede ao usuário
            aguardandoNome.set(remetenteId, { mensagemOriginal: message.body });
            await responderBot(message, '👋 Olá! Eu sou o *Finance Manager*.\nPara começar, me diz qual é o seu nome?');
            return;
        }

        await processarMensagem(message.body, remetenteId, nome, message);
    }
};

async function processarMensagem(textoMensagem, remetenteId, nome, message) {
    const resultado = await classificarMensagem(textoMensagem);

    console.log('Classificação do Gemini:', resultado);

    if (resultado.tipo === 'irrelevante') {
        return;
    }

    // Monta a resposta de confirmação para o usuário
    let confirmacao = '';

    try {
        if (resultado.tipo === 'entrada') {
            await registrarEntrada(nome, resultado.valor, resultado.descricao);
            const valor = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'valor não identificado';
            confirmacao = `✅ *Entrada registrada!*\n👤 Pessoa: ${nome}\n💰 Valor: ${valor}\n📝 Descrição: ${resultado.descricao || 'não informada'}`;
        }
        else if (resultado.tipo === 'saida') {
            await registrarSaida(nome, resultado.valor, resultado.descricao);
            const valor = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'valor não identificado';
            confirmacao = `✅ *Saída registrada!*\n👤 Pessoa: ${nome}\n💸 Valor: ${valor}\n📝 Descrição: ${resultado.descricao || 'não informada'}`;
        }
        else if (resultado.tipo === 'parcelado') {
            await registrarParcelado(nome, resultado.valorTotal, resultado.valorParcela, resultado.totalParcelas, resultado.descricao, resultado.parcelaAtual);
            const valorTotal = resultado.valorTotal ? `R$ ${resultado.valorTotal.toFixed(2)}` : 'não informado';
            const valorParcela = resultado.valorParcela ? `R$ ${resultado.valorParcela.toFixed(2)}` : 'não informado';
            confirmacao = `✅ *Compra parcelada registrada!*\n👤 Pessoa: ${nome}\n🛒 Descrição: ${resultado.descricao || 'não informada'}\n💳 Total: ${valorTotal}\n📆 Parcelas: ${resultado.totalParcelas}x de ${valorParcela}\n📌 Começando na: ${resultado.parcelaAtual || 1}ª parcela`;
        }
        else if (resultado.tipo === 'alteracao') {
            // Busca incluindo assinaturas agora
            const lancamentos = await buscarUltimosLancamentos(resultado.termoBusca, 5, true);

            if (lancamentos.length === 0) {
                confirmacao = `❌ Não encontrei nenhum lançamento recente com "${resultado.termoBusca}" para alterar.`;
            } else {
                // Pega o primeiro (mais recente)
                const last = lancamentos[0];
                const novosDados = {};
                if (resultado.novoValor !== null) novosDados.value = resultado.novoValor;
                if (resultado.novaDescricao !== null) novosDados.description = resultado.novaDescricao;
                if (resultado.novaPessoa !== null) novosDados.person = resultado.novaPessoa;

                if (Object.keys(novosDados).length === 0) {
                    confirmacao = `❓ Não identifiquei o que você quer alterar no lançamento: "${last.description}".`;
                } else {
                    await atualizarLancamento(last.id, novosDados);
                    let prefixo = last.type === 'assinatura' ? '📌 *Assinatura alterada!*' : '✅ *Lançamento alterado!*';
                    confirmacao = `${prefixo}\n\n*De:* ${last.description} (R$ ${last.value.toFixed(2)})\n*Para:* ${novosDados.description || last.description} (R$ ${(novosDados.value || last.value).toFixed(2)})`;

                    if (last.type === 'assinatura') {
                        confirmacao += `\n\n_Note: Mudanças em assinaturas afetam apenas os próximos lançamentos automáticos._`;
                    }
                }
            }
        }
        else if (resultado.tipo === 'assinatura') {
            await registrarAssinatura(nome, resultado.valor, resultado.descricao, resultado.frequencia);
            const valor = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'não informado';
            confirmacao = `✅ *Assinatura registrada!*\n👤 Pessoa: ${nome}\n📝 Descrição: ${resultado.descricao || 'não informada'}\n💰 Valor: ${valor}\n📆 Recorrência: ${resultado.frequencia || 'mensal'}\n📌 Os lançamentos serão automáticos a partir de agora!`;
        }

        await responderBot(message, confirmacao);
    } catch (error) {
        console.error('Erro ao registrar no banco de dados:', error);
        await responderBot(message, '❌ Ocorreu um erro ao salvar o registro no banco de dados.');
    }
}