const pool = require('./db');

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Conectado com sucesso ao banco na Neon!', res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('Erro ao conectar:', err);
    process.exit(1);
  }
}

testConnection();

