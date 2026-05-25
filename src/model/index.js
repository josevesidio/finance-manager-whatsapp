import database from '../db/index.js'
import { Transaction } from './transaction.js'
import { User } from './user.js'
import { Reminder } from './reminder.js'

export default async () => {
  try {
    // Sincroniza tabelas com suporte a alteração de esquema
    await Transaction.sync({ alter: true })
    await User.sync({ alter: true })
    await Reminder.sync({ alter: true })
  } catch (error) {
    console.log("Error:", error)
  }
}
