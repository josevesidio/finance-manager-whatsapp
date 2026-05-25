import { Sequelize } from 'sequelize'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.resolve(__dirname, '../../data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'finance-manager.sqlite')

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: false,
})

async function migrateLegacySchema() {
  const queryInterface = sequelize.getQueryInterface()

  try {
    const userTable = await queryInterface.describeTable('users')

    if (userTable.nome && !userTable.name) {
      await sequelize.query('ALTER TABLE users RENAME COLUMN nome TO name')
    }
    if (userTable.limiteGastos && !userTable.spendingLimit) {
      await sequelize.query('ALTER TABLE users RENAME COLUMN limiteGastos TO spendingLimit')
    }
  } catch {
    // Table may not exist yet on first run
  }

  const typeMigrations = [
    ['entrada', 'income'],
    ['saida', 'expense'],
    ['parcelado', 'installment'],
    ['assinatura', 'subscription'],
  ]

  for (const [oldType, newType] of typeMigrations) {
    await sequelize.query(
      `UPDATE transactions SET type = :newType WHERE type = :oldType`,
      { replacements: { oldType, newType } }
    )
  }

  await sequelize.query(
    `UPDATE transactions SET frequency = 'monthly' WHERE frequency = 'mensal'`
  )
  await sequelize.query(
    `UPDATE transactions SET frequency = 'annual' WHERE frequency = 'anual'`
  )
}

async function connectAndSync() {
  try {
    await sequelize.authenticate()
    console.log(`Banco de dados SQLite conectado: ${dbPath}`)

    await migrateLegacySchema()
    await sequelize.sync()
    console.log('Tabelas sincronizadas com sucesso!')

  } catch (error) {
    console.error('Erro ao conectar ou sincronizar o banco de dados:', error)
    process.exit(1)
  }
}

connectAndSync()

export default { sequelize }
