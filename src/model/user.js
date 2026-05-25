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
  nome: {
    type: Sequelize.STRING,
    allowNull: false,
  }
})

User = await modelHelper.inject(User)

export default { User }
