const pool = require('./db');

async function runMigration() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "Empresa" (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        "telefoneWa" TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        "criadoEm" TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "Cliente" (
        id SERIAL PRIMARY KEY,
        nome TEXT,
        telefone TEXT NOT NULL,
        "empresaId" INTEGER REFERENCES "Empresa"(id) ON DELETE CASCADE,
        UNIQUE(telefone, "empresaId")
      );

      CREATE TABLE IF NOT EXISTS "Servico" (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        preco DOUBLE PRECISION NOT NULL,
        "duracaoMin" INTEGER NOT NULL,
        "empresaId" INTEGER REFERENCES "Empresa"(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS "Agendamento" (
        id SERIAL PRIMARY KEY,
        "dataHora" TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'PENDENTE',
        "clienteId" INTEGER REFERENCES "Cliente"(id) ON DELETE CASCADE,
        "servicoId" INTEGER REFERENCES "Servico"(id) ON DELETE CASCADE,
        "empresaId" INTEGER REFERENCES "Empresa"(id) ON DELETE CASCADE
      );
    `);
    console.log('Tabelas criadas com sucesso na Neon!');
    process.exit(0);
  } catch (err) {
    console.error('Erro ao rodar migração:', err);
    process.exit(1);
  }
}

runMigration();

