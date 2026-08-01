const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function usePostgresAuthState() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS baileys_auth (
            key VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    const readData = async (key) => {
        try {
            const res = await pool.query('SELECT value FROM baileys_auth WHERE key = $1', [key]);
            if (res.rows.length === 0) return null;
            return JSON.parse(res.rows[0].value, BufferJSON.reviver);
        } catch (error) {
            console.error(`Erro lendo auth ${key}:`, error);
            return null;
        }
    };

    const writeData = async (data, key) => {
        try {
            const jsonString = JSON.stringify(data, BufferJSON.replacer);
            await pool.query(`
                INSERT INTO baileys_auth (key, value) 
                VALUES ($1, $2) 
                ON CONFLICT (key) DO UPDATE SET value = $2;
            `, [key, jsonString]);
        } catch (error) {
            console.error(`Erro salvando auth ${key}:`, error);
        }
    };

    const removeData = async (key) => {
        try {
            await pool.query('DELETE FROM baileys_auth WHERE key = $1', [key]);
        } catch (error) {
            console.error(`Erro removendo auth ${key}:`, error);
        }
    };

    const creds = await readData('creds') || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
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
                                tasks.push(writeData(value, key));
                            } else {
                                tasks.push(removeData(key));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            await writeData(creds, 'creds');
        }
    };
}

module.exports = { usePostgresAuthState };
