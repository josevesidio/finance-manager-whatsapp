import { User } from '../model/user.js';
import client from '../utils/client.js';

/**
 * Finds a user by WhatsApp ID.
 * Returns the database record or null if not found.
 */
export async function findUser(whatsappId) {
    return await User.findOne({ where: { whatsappId } });
}

/**
 * Extracts the phone number from a WhatsApp ID.
 * Ex: '5511999999999@c.us' → '11 99999-9999'
 */
function formatPhone(whatsappId) {
    const number = whatsappId.replace(/@.*$/, '');

    if (number.length >= 12) {
        const areaCode = number.slice(2, 4);
        const part1 = number.slice(4, -4);
        const part2 = number.slice(-4);
        return `${areaCode} ${part1}-${part2}`;
    }

    return number;
}

/**
 * Resolves duplicate names by appending the phone number.
 */
async function resolveDuplicateName(whatsappId, name) {
    const duplicate = await User.findOne({ where: { name } });

    if (duplicate) {
        const phone = formatPhone(whatsappId);
        return `${name} (${phone})`;
    }

    return name;
}

/**
 * Creates a new user with the given WhatsApp ID and name.
 */
export async function createUser(whatsappId, name) {
    const resolvedName = await resolveDuplicateName(whatsappId, name);
    return await User.create({ whatsappId, name: resolvedName });
}

/**
 * Returns the user's name by WhatsApp ID.
 */
export async function getUserName(whatsappId) {
    const user = await findUser(whatsappId);
    if (user) {
        return user.name;
    }

    try {
        if (!whatsappId) return null;
        const contact = await client.getContactById(whatsappId);
        const whatsappName = contact.pushname || contact.name || null;

        if (whatsappName) {
            await createUser(whatsappId, whatsappName);
            const createdUser = await findUser(whatsappId);
            return createdUser.name;
        }
    } catch (error) {
        console.error('Erro ao buscar contato do WhatsApp:', error.message);
    }

    return null;
}

export default { findUser, createUser, getUserName };
