const pool = require('./db');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

async function usePostgresAuthState() {
  // Cria a tabela de sessão caso ela não exista
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "BaileysState" (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const readData = async (key) => {
    try {
      const res = await pool.query('SELECT value FROM "BaileysState" WHERE key = $1', [key]);
      if (res.rows.length === 0) return null;
      return JSON.parse(res.rows[0].value, BufferJSON.reviver);
    } catch (err) {
      return null;
    }
  };

  const writeData = async (key, data) => {
    try {
      const jsonString = JSON.stringify(data, BufferJSON.replacer);
      await pool.query(
        `INSERT INTO "BaileysState" (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [key, jsonString]
      );
    } catch (err) {
      console.error(`Erro ao salvar chave ${key}:`, err);
    }
  };

  const removeData = async (key) => {
    try {
      await pool.query('DELETE FROM "BaileysState" WHERE key = $1', [key]);
    } catch (err) {
      console.error(`Erro ao remover chave ${key}:`, err);
    }
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            const value = await readData(`${type}-${id}`);
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                tasks.push(writeData(key, value));
              } else {
                tasks.push(removeData(key));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData('creds', creds)
  };
}

module.exports = { usePostgresAuthState };

