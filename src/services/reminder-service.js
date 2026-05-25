import { Reminder } from '../model/reminder.js';

export async function createReminder(person, value, description, dueDay) {
    return await Reminder.create({
        person: person,
        value: value || 0,
        description: description || 'sem descrição',
        dueDate: dueDay,
        isActive: true
    });
}

export async function findRemindersForDay(dayOfMonth) {
    return await Reminder.findAll({
        where: {
            dueDate: dayOfMonth,
            isActive: true
        }
    });
}

export async function listActiveReminders(person) {
    const where = { isActive: true };
    if (person) {
        where.person = person;
    }
    return await Reminder.findAll({
        where,
        order: [['dueDate', 'ASC']]
    });
}

export async function markReminderPaid(id) {
    const reminder = await Reminder.findByPk(id);
    if (!reminder) throw new Error('Lembrete não encontrado');

    reminder.isActive = false;
    await reminder.save();
    return reminder;
}

export default {
    createReminder,
    findRemindersForDay,
    listActiveReminders,
    markReminderPaid
};
