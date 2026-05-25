import database from '../db/index.js'
import { Transaction } from './transaction.js'
import { User } from './user.js'

export default async () => {
  try {
    // await database.sequelize.sync()

    await Transaction.sync({ alter: true }) // Adicionando alter para atualizar os campos novos
    await User.sync()
  } catch (error) {
    console.log("Error:", error)
  }
}
