import { Sequelize } from 'sequelize'
import database from '../db/index.js'
import modelHelper from '../helper/model-helper.js'

export var Reminder = database.sequelize.define('reminder', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true
  },
  description: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  value: {
    type: Sequelize.FLOAT,
    allowNull: false,
    defaultValue: 0
  },
  dueDate: {
    type: Sequelize.INTEGER, // dia do mês (1 a 31)
    allowNull: false,
  },
  person: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  isActive: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
})

Reminder = await modelHelper.inject(Reminder)

export default { Reminder }
