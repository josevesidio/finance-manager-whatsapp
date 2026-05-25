import { Sequelize } from 'sequelize'
import database from '../db/index.js'
import modelHelper from '../helper/model-helper.js'

export var Transaction = database.sequelize.define('transaction', {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true
  },
  type: {
    type: Sequelize.STRING, // 'income', 'expense', 'installment', 'subscription'
    allowNull: false,
  },
  date: {
    type: Sequelize.DATE,
    allowNull: false,
  },
  value: {
    type: Sequelize.FLOAT,
    allowNull: false,
    defaultValue: 0
  },
  valuePerMonth: {
    type: Sequelize.FLOAT, // Para compras parceladas
    allowNull: true,
  },
  actuallyParcel: {
    type: Sequelize.INTEGER, // Parcela atual
    allowNull: true,
  },
  totalParcel: {
    type: Sequelize.INTEGER, // Total de parcelas
    allowNull: true,
  },
  description: {
    type: Sequelize.STRING,
  },
  person: {
    type: Sequelize.STRING,
  },
  category: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  isSplit: {
    type: Sequelize.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  },
  originalValue: {
    type: Sequelize.FLOAT,
    allowNull: true,
  },
  // Campos para Assinaturas/Recorrência
  frequency: {
    type: Sequelize.STRING, // 'monthly', 'annual'
    allowNull: true,
  },
  isActive: {
    type: Sequelize.BOOLEAN, // Apenas para o registro 'template' da assinatura
    allowNull: true,
    defaultValue: false
  },
  lastGenerated: {
    type: Sequelize.DATE, // Data da última geração de transação real
    allowNull: true,
  }
})

Transaction = await modelHelper.inject(Transaction)

export default { Transaction }
