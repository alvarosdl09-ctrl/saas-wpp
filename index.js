const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(express.json());
app.use(cors());

// Rota de Teste do Servidor
app.get('/', (req, res) => {
  res.json({ status: 'SaaS WhatsApp rodando com sucesso!' });
});

// Listar Empresas
app.get('/empresas', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "Empresa"');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar Nova Empresa
app.post('/empresas', async (req, res) => {
  const { nome, telefoneWa, email } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO "Empresa" (nome, "telefoneWa", email) VALUES ($1, $2, $3) RETURNING *',
      [nome, telefoneWa, email]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

