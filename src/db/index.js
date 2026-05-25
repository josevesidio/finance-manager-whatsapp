import { Sequelize } from 'sequelize'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Diretório onde o arquivo SQLite será armazenado
const dataDir = path.resolve(__dirname, '../../data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'finance-manager.sqlite')

// Inicializa a conexão com o Sequelize usando SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: false,
  // timezone: '-03:00'
})

// Função para testar a conexão e sincronizar as tabelas
async function connectAndSync() {
  try {
    await sequelize.authenticate()
    console.log(`Banco de dados SQLite conectado: ${dbPath}`)

    // Sincroniza todos os modelos com o banco de dados
    await sequelize.sync()
    console.log('Tabelas sincronizadas com sucesso!')

  } catch (error) {
    console.error('Erro ao conectar ou sincronizar o banco de dados:', error)
    process.exit(1)
  }
}

connectAndSync()

export default { sequelize }