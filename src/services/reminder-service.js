import { Reminder } from '../model/reminder.js';

export async function criarLembrete(pessoa, valor, descricao, diaVencimento) {
    return await Reminder.create({
        person: pessoa,
        value: valor || 0,
        description: descricao || 'sem descrição',
        dueDate: diaVencimento,
        isActive: true
    });
}

export async function buscarLembretesDoDia(diaDoMes) {
    return await Reminder.findAll({
        where: {
            dueDate: diaDoMes,
            isActive: true
        }
    });
}

export async function listarLembretesAtivos(pessoa) {
    const where = { isActive: true };
    if (pessoa) {
        where.person = pessoa;
    }
    return await Reminder.findAll({
        where,
        order: [['dueDate', 'ASC']]
    });
}

export async function marcarLembretePago(id) {
    const lembrete = await Reminder.findByPk(id);
    if (!lembrete) throw new Error('Lembrete não encontrado');
    
    lembrete.isActive = false;
    await lembrete.save();
    return lembrete;
}

export default {
    criarLembrete,
    buscarLembretesDoDia,
    listarLembretesAtivos,
    marcarLembretePago
};
