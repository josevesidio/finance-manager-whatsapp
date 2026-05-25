import { User } from '../model/user.js';
import client from '../utils/client.js';

/**
 * Busca o usuário pelo WhatsApp ID.
 * Retorna o registro do banco ou null se não existir.
 */
export async function buscarUsuario(whatsappId) {
    return await User.findOne({ where: { whatsappId } });
}

/**
 * Extrai o número de telefone do WhatsApp ID.
 * Ex: '5511999999999@c.us' → '(55) 11 99999-9999'
 */
function formatarTelefone(whatsappId) {
    const numero = whatsappId.replace(/@.*$/, '');

    // Formato brasileiro: DDD + número
    if (numero.length >= 12) {
        const ddd = numero.slice(2, 4);
        const parte1 = numero.slice(4, -4);
        const parte2 = numero.slice(-4);
        return `${ddd} ${parte1}-${parte2}`;
    }

    return numero;
}

/**
 * Verifica se já existe outro usuário com o mesmo nome.
 * Se existir, adiciona o telefone ao nome para diferenciar.
 */
async function resolverNomeDuplicado(whatsappId, nome) {
    const duplicado = await User.findOne({ where: { nome } });

    if (duplicado) {
        const telefone = formatarTelefone(whatsappId);
        return `${nome} (${telefone})`;
    }

    return nome;
}

/**
 * Cria um novo usuário com o WhatsApp ID e nome informados.
 * Se o nome já existir no banco, adiciona o telefone para diferenciar.
 */
export async function criarUsuario(whatsappId, nome) {
    const nomeResolvido = await resolverNomeDuplicado(whatsappId, nome);
    return await User.create({ whatsappId, nome: nomeResolvido });
}

/**
 * Busca o nome do usuário pelo WhatsApp ID.
 * 
 * Fluxo:
 * 1. Verifica se já existe no banco → retorna o nome salvo
 * 2. Se não existe, tenta pegar o nome do contato no WhatsApp
 * 3. Se conseguir o nome do WhatsApp, salva no banco e retorna
 * 4. Se não conseguir, retorna null (precisa perguntar à pessoa)
 */
export async function obterNomeUsuario(whatsappId) {
    // 1. Já está no banco?
    const usuario = await buscarUsuario(whatsappId);
    if (usuario) {
        return usuario.nome;
    }

    // 2. Tenta pegar o nome do contato no WhatsApp
    try {
        if (!whatsappId) return null;
        const contato = await client.getContactById(whatsappId);
        const nomeWhatsapp = contato.pushname || contato.name || null;

        if (nomeWhatsapp) {
            await criarUsuario(whatsappId, nomeWhatsapp);
            const usuarioCriado = await buscarUsuario(whatsappId);
            return usuarioCriado.nome;
        }
    } catch (error) {
        console.error('Erro ao buscar contato do WhatsApp:', error.message);
    }

    // 3. Não encontrou nome em lugar nenhum
    return null;
}

export default { buscarUsuario, criarUsuario, obterNomeUsuario };
