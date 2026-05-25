import { Sequelize } from 'sequelize'
import database from '../db/index.js'
import modelHelper from '../helper/model-helper.js'

export var User = database.sequelize.define('user', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true
  },
  whatsappId: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  spendingLimit: {
    type: Sequelize.FLOAT,
    allowNull: true,
    defaultValue: null,
  }
})

User = await modelHelper.inject(User)

export default { User }
