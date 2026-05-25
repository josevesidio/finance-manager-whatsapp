import { classificarMensagem } from '../../services/gemini-service.js';
import { obterNomeUsuario, criarUsuario } from '../../services/user-service.js';
import { 
    registrarEntrada, 
    registrarSaida, 
    registrarParcelado, 
    buscarUltimosLancamentos, 
    atualizarLancamento, 
    registrarAssinatura,
    registrarDivisao,
    obterResumoMensal,
    buscarAssinaturaAtivaPorDescricao,
    desativarAssinatura
} from '../../services/finance-service.js';
import { 
    criarLembrete, 
    listarLembretesAtivos, 
    marcarLembretePago 
} from '../../services/reminder-service.js';
import { User } from '../../model/user.js';
import { commandsHelp } from '../commands/help.js';

// Armazena os IDs que estão aguardando informar o nome
// Formato: { 'whatsappId': { mensagemOriginal: message.body } }
const aguardandoNome = new Map();

// Armazena as assinaturas duplicadas aguardando confirmação Sim/Não
const aguardandoConfirmacaoAssinatura = new Map();

// Armazena os IDs das mensagens enviadas pelo bot para ignorá-las
const mensagensDoBot = new Set();

// Função auxiliar para enviar mensagem e rastrear o ID
async function responderBot(message, texto) {
    const msgEnviada = await message.reply(texto);
    if (msgEnviada && msgEnviada.id) {
        mensagensDoBot.add(msgEnviada.id._serialized);
    }
}

// Formatação do resumo mensal em texto
async function formatarResumoMensal(nome) {
    const resumo = await obterResumoMensal(nome);
    let texto = `💰 *Resumo Financeiro - Mês Atual*\n👤 Usuário: *${nome}*\n\n`;
    texto += `🟢 *Entradas:* R$ ${resumo.entradas.toFixed(2)}\n`;
    texto += `🔴 *Saídas/Gastos:* R$ ${resumo.saidas.toFixed(2)}\n`;
    
    const saldoEmoji = resumo.saldo >= 0 ? '🔵' : '⚠️';
    texto += `${saldoEmoji} *Saldo:* R$ ${resumo.saldo.toFixed(2)}\n\n`;

    if (resumo.limiteGastos) {
        texto += `🎯 *Limite Mensal:* R$ ${resumo.limiteGastos.toFixed(2)}\n`;
        texto += `📊 *Uso do Limite:* ${resumo.porcentagemLimite}%\n`;
        if (resumo.porcentagemLimite >= 100) {
            texto += `🚨 *Atenção! Você ultrapassou o limite em R$ ${(resumo.saidas - resumo.limiteGastos).toFixed(2)}!*\n`;
        } else if (resumo.porcentagemLimite >= 80) {
            texto += `⚠️ *Aviso: Você está próximo de atingir seu limite de gastos.*\n`;
        }
        texto += `\n`;
    }

    texto += `🗂️ *Gastos por Categoria:*\n`;
    const cats = Object.keys(resumo.categorias);
    if (cats.length === 0) {
        texto += `_Nenhum gasto registrado ainda._`;
    } else {
        cats.forEach(c => {
            texto += `- *${c.charAt(0).toUpperCase() + c.slice(1)}*: R$ ${resumo.categorias[c].toFixed(2)}\n`;
        });
    }

    return texto;
}

// Formatação do relatório completo (resumo + transações)
async function formatarRelatorioCompleto(nome) {
    const resumoFormatado = await formatarResumoMensal(nome);
    
    // Busca últimos lançamentos gerais
    const lancamentos = await buscarUltimosLancamentos(null, 20, false);
    // Filtra transações do usuário específico
    const meusLancamentos = lancamentos.filter(l => l.person === nome);

    let texto = resumoFormatado + `\n📝 *Últimos Lançamentos (Mês Vigente):*\n`;
    if (meusLancamentos.length === 0) {
        texto += `_Nenhum lançamento recente encontrado._`;
    } else {
        meusLancamentos.slice(0, 5).forEach(l => {
            const dataStr = new Date(l.date).toLocaleDateString('pt-BR');
            const valor = l.type === 'parcelado' ? l.valuePerMonth : l.value;
            const sinal = l.type === 'entrada' ? '🟢 +' : '🔴 -';
            texto += `[${dataStr}] ${sinal} R$ ${valor.toFixed(2)} - ${l.description} (${l.category || 'outros'})\n`;
        });
    }

    return texto;
}

// Formatação de lembretes ativos
async function formatarLembretes(nome) {
    const lembretes = await listarLembretesAtivos(nome);
    let texto = `📅 *Lembretes de Contas - ${nome}*\n\n`;
    if (lembretes.length === 0) {
        texto += `_Você não tem lembretes de contas ativos._`;
    } else {
        lembretes.forEach(l => {
            texto += `📌 *Dia ${l.dueDate}*: ${l.description} - R$ ${l.value.toFixed(2)} _(ID: ${l.id})_\n`;
        });
        texto += `\n_Para pagar uma conta, envie: *!pago [ID]*_`;
    }
    return texto;
}

export default {
    name: 'message_create',
    async execute(message) {
        // Filtra apenas os chats monitorados (se configurado no .env)
        if (process.env.CHAT_MONITORIN && !process.env.CHAT_MONITORIN.split(',').includes(message.to)) {
            return;
        }

        // Verifica de imediato e ignora se a mensagem contém emojis do bot
        // Evitando loops rápidos e economizando processamento de IA
        const botEmojis = ['✅', '❌', '👋', '💰', '🛒', '💸', '💳', '📆', '🟢', '🔴', '⚠️', '🚨', '📌'];
        if (message.fromMe && botEmojis.some(emoji => message.body.startsWith(emoji))) {
            return;
        }

        // Aguarda um pequeno delay para garantir sincronia do ID em mensagens do próprio bot
        await new Promise(resolve => setTimeout(resolve, 100));

        // Ignora mensagens enviadas pelo bot (rastreadas por ID)
        if (mensagensDoBot.has(message.id._serialized)) {
            mensagensDoBot.delete(message.id._serialized);
            return;
        }

        // Pega o ID de quem enviou (em grupos usa author, em chat privado usa from)
        const remetenteId = message.author || message.from;
        if (!remetenteId) return;

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
        }

        // Se o usuário está confirmando uma assinatura duplicada
        if (aguardandoConfirmacaoAssinatura.has(remetenteId)) {
            const resposta = message.body.trim().toLowerCase();
            const dadosPendentes = aguardandoConfirmacaoAssinatura.get(remetenteId);
            
            if (resposta === 'sim' || resposta === 's') {
                aguardandoConfirmacaoAssinatura.delete(remetenteId);
                const resultado = dadosPendentes.resultado;
                const cat = resultado.categoria || 'contas';
                
                try {
                    await registrarAssinatura(nome, resultado.valor, resultado.descricao, resultado.frequencia, cat);
                    const valorStr = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'não informado';
                    await responderBot(message, `✅ *Assinatura registrada com sucesso!*\n👤 Pessoa: ${nome}\n📝 Descrição: ${resultado.descricao}\n🗂️ Categoria: ${cat}\n💰 Valor: ${valorStr}\n📆 Recorrência: ${resultado.frequencia || 'mensal'}\n📌 Os lançamentos serão automáticos a partir de agora!`);
                } catch (error) {
                    console.error('Erro ao registrar assinatura confirmada:', error);
                    await responderBot(message, '❌ Ocorreu um erro ao salvar o registro no banco de dados.');
                }
            } else if (resposta === 'não' || resposta === 'nao' || resposta === 'n') {
                aguardandoConfirmacaoAssinatura.delete(remetenteId);
                await responderBot(message, '❌ *Cadastro de assinatura cancelado.*');
            } else {
                await responderBot(message, '❓ Resposta inválida. Por favor, responda apenas com *Sim* ou *Não* para confirmar a nova assinatura.');
            }
            return;
        }

        // --- INTERCEPTADOR DE COMANDOS DIRETOS (SEM IA) ---
        const textoMsg = message.body.trim();
        if (textoMsg.startsWith('!')) {
            const args = textoMsg.slice(1).trim().split(/ +/);
            const comando = args.shift().toLowerCase();

            if (comando === 'commands' || comando === 'ajuda') {
                const ajuda = commandsHelp(message);
                await responderBot(message, ajuda);
                return;
            }
            
            if (comando === 'ping') {
                await responderBot(message, '✅ Pong! O bot está ativo e respondendo.');
                return;
            }

            if (comando === 'resumo' || comando === 'gastos') {
                const resumo = await formatarResumoMensal(nome);
                await responderBot(message, resumo);
                return;
            }

            if (comando === 'relatorio') {
                const relatorio = await formatarRelatorioCompleto(nome);
                await responderBot(message, relatorio);
                return;
            }

            if (comando === 'limite') {
                const valorLimite = parseFloat(args[0]);
                if (isNaN(valorLimite) || valorLimite < 0) {
                    await responderBot(message, '❌ Uso correto: *!limite [valor]*\nExemplo: `!limite 1500`');
                    return;
                }
                const usuario = await User.findOne({ where: { whatsappId: remetenteId } });
                if (usuario) {
                    usuario.limiteGastos = valorLimite;
                    await usuario.save();
                    await responderBot(message, `✅ *Limite de gastos mensal configurado:* R$ ${valorLimite.toFixed(2)}`);
                } else {
                    await responderBot(message, '❌ Usuário não encontrado no sistema.');
                }
                return;
            }

            if (comando === 'lembretes') {
                const lembretes = await formatarLembretes(nome);
                await responderBot(message, lembretes);
                return;
            }

            if (comando === 'pago') {
                const idLembrete = parseInt(args[0]);
                if (isNaN(idLembrete)) {
                    await responderBot(message, '❌ Uso correto: *!pago [ID_DO_LEMBRETE]*\nUse `!lembretes` para ver os IDs.');
                    return;
                }
                try {
                    const lembrete = await marcarLembretePago(idLembrete);
                    
                    // Transforma em lançamento real de saída
                    await registrarSaida(nome, lembrete.value, `[PAGO] ${lembrete.description}`, 'contas');
                    
                    await responderBot(message, `✅ *Lembrete pago com sucesso!*\nA conta "${lembrete.description}" de R$ ${lembrete.value.toFixed(2)} foi marcada como paga e registrada em seus gastos.`);
                } catch (err) {
                    await responderBot(message, `❌ Erro ao pagar lembrete: ${err.message}`);
                }
                return;
            }
        }

        // Se não for comando direto, processa linguagem natural via Gemini
        await processarMensagem(message.body, remetenteId, nome, message);
    }
};

async function processarMensagem(textoMensagem, remetenteId, nome, message) {
    const resultado = await classificarMensagem(textoMensagem);

    console.log('Classificação do Gemini:', resultado);

    if (resultado.tipo === 'irrelevante') {
        return;
    }

    let confirmacao = '';

    try {
        if (resultado.tipo === 'entrada') {
            const cat = resultado.categoria || 'outros';
            await registrarEntrada(nome, resultado.valor, resultado.descricao, cat);
            const valor = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'valor não identificado';
            confirmacao = `✅ *Entrada registrada!*\n👤 Pessoa: ${nome}\n💰 Valor: ${valor}\n📝 Descrição: ${resultado.descricao || 'não informada'}\n🗂️ Categoria: ${cat}`;
        }
        else if (resultado.tipo === 'saida') {
            const cat = resultado.categoria || 'outros';
            await registrarSaida(nome, resultado.valor, resultado.descricao, cat);
            const valor = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'valor não identificado';
            confirmacao = `✅ *Saída registrada!*\n👤 Pessoa: ${nome}\n💸 Valor: ${valor}\n📝 Descrição: ${resultado.descricao || 'não informada'}\n🗂️ Categoria: ${cat}`;
            
            // Alerta de limite
            const limiteAviso = await checarAlertaLimite(nome);
            if (limiteAviso) confirmacao += `\n\n${limiteAviso}`;
        }
        else if (resultado.tipo === 'parcelado') {
            const cat = resultado.categoria || 'outros';
            await registrarParcelado(nome, resultado.valorTotal, resultado.valorParcela, resultado.totalParcelas, resultado.descricao, resultado.parcelaAtual, cat);
            const valorTotal = resultado.valorTotal ? `R$ ${resultado.valorTotal.toFixed(2)}` : 'não informado';
            const valorParcela = resultado.valorParcela ? `R$ ${resultado.valorParcela.toFixed(2)}` : 'não informado';
            confirmacao = `✅ *Compra parcelada registrada!*\n👤 Pessoa: ${nome}\n🛒 Descrição: ${resultado.descricao || 'não informada'}\n🗂️ Categoria: ${cat}\n💳 Total: ${valorTotal}\n📆 Parcelas: ${resultado.totalParcelas}x de ${valorParcela}\n📌 Começando na: ${resultado.parcelaAtual || 1}ª parcela`;
            
            // Alerta de limite
            const limiteAviso = await checarAlertaLimite(nome);
            if (limiteAviso) confirmacao += `\n\n${limiteAviso}`;
        }
        else if (resultado.tipo === 'alteracao') {
            const lancamentos = await buscarUltimosLancamentos(resultado.termoBusca, 5, true);

            if (lancamentos.length === 0) {
                confirmacao = `❌ Não encontrei nenhum lançamento recente com "${resultado.termoBusca}" para alterar.`;
            } else {
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
            const assinaturaExistente = await buscarAssinaturaAtivaPorDescricao(nome, resultado.descricao);
            
            if (assinaturaExistente) {
                // Guarda no Map para aguardar confirmação sim/não
                aguardandoConfirmacaoAssinatura.set(remetenteId, { resultado, nome });
                
                const valorExistente = assinaturaExistente.value ? `R$ ${assinaturaExistente.value.toFixed(2)}` : 'não informado';
                const valorNovo = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'não informado';
                
                confirmacao = `⚠️ *Assinatura Duplicada Detectada!*\n\nVocê já possui uma assinatura ativa de *"${assinaturaExistente.description}"* no valor de *${valorExistente}*.\n\nTem certeza que deseja adicionar uma nova assinatura de *"${resultado.descricao}"* por *${valorNovo}*?\n\nResponda apenas com *Sim* ou *Não*.`;
            } else {
                const cat = resultado.categoria || 'contas';
                await registrarAssinatura(nome, resultado.valor, resultado.descricao, resultado.frequencia, cat);
                const valor = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'não informado';
                confirmacao = `✅ *Assinatura registrada!*\n👤 Pessoa: ${nome}\n📝 Descrição: ${resultado.descricao || 'não informada'}\n🗂️ Categoria: ${cat}\n💰 Valor: ${valor}\n📆 Recorrência: ${resultado.frequencia || 'mensal'}\n📌 Os lançamentos serão automáticos a partir de agora!`;
            }
        }
        else if (resultado.tipo === 'cancelamento') {
            const assinaturaCancelada = await desativarAssinatura(nome, resultado.descricao);
            
            if (assinaturaCancelada) {
                confirmacao = `✅ *Assinatura cancelada com sucesso!*\n\nA recorrência de *"${assinaturaCancelada.description}"* foi desativada e não gerará novos lançamentos automáticos.`;
            } else {
                confirmacao = `❌ Não encontrei nenhuma assinatura ativa de *"${resultado.descricao}"* para cancelar.`;
            }
        }
        else if (resultado.tipo === 'divisao') {
            const cat = resultado.categoria || 'lazer';
            const pessoas = resultado.pessoas || [];
            
            await registrarDivisao(nome, resultado.valorTotal, resultado.descricao, pessoas, cat);
            const valorIndividual = (resultado.valorTotal / pessoas.length).toFixed(2);
            confirmacao = `✅ *Divisão de despesa registrada!*\n👤 Solicitante: ${nome}\n🛒 Descrição: ${resultado.descricao || 'não informada'}\n💰 Total: R$ ${resultado.valorTotal.toFixed(2)}\n👥 Divisão entre: ${pessoas.join(', ')}\n💸 Valor para cada: R$ ${valorIndividual}`;
        }
        else if (resultado.tipo === 'limite') {
            const usuario = await User.findOne({ where: { whatsappId: remetenteId } });
            if (usuario) {
                usuario.limiteGastos = resultado.valor;
                await usuario.save();
                confirmacao = `✅ *Limite de gastos mensal configurado:* R$ ${resultado.valor.toFixed(2)}`;
            } else {
                confirmacao = `❌ Usuário não encontrado no sistema.`;
            }
        }
        else if (resultado.tipo === 'lembrete') {
            await criarLembrete(nome, resultado.valor, resultado.descricao, resultado.diaVencimento);
            confirmacao = `✅ *Lembrete agendado com sucesso!*\n👤 Pessoa: ${nome}\n📝 Conta: ${resultado.descricao}\n💰 Valor: R$ ${resultado.valor.toFixed(2)}\n📆 Vencimento: Todo dia ${resultado.diaVencimento}\n📌 Eu avisarei no chat na manhã do vencimento.`;
        }
        else if (resultado.tipo === 'relatorio') {
            confirmacao = await formatarRelatorioCompleto(nome);
        }

        await responderBot(message, confirmacao);
    } catch (error) {
        console.error('Erro ao registrar no banco de dados:', error);
        await responderBot(message, '❌ Ocorreu um erro ao salvar o registro no banco de dados.');
    }
}

// Verifica se o usuário excedeu metas de limite de despesas
async function checarAlertaLimite(nome) {
    const resumo = await obterResumoMensal(nome);
    if (!resumo.limiteGastos) return null;
    
    if (resumo.porcentagemLimite >= 100) {
        return `🚨 *ALERTA:* Você ultrapassou 100% do seu limite de gastos mensal! (Gasto: R$ ${resumo.saidas.toFixed(2)} de R$ ${resumo.limiteGastos.toFixed(2)})`;
    }
    if (resumo.porcentagemLimite >= 80) {
        return `⚠️ *AVISO:* Você atingiu ${resumo.porcentagemLimite}% do seu limite de gastos mensal! (Gasto: R$ ${resumo.saidas.toFixed(2)} de R$ ${resumo.limiteGastos.toFixed(2)})`;
    }
    return null;
}