const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { usePostgresAuthState } = require('./postgresAuthState');
const { Pool } = require('pg');
const pino = require('pino');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inicializarBanco() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cliente_estado (
                telefone VARCHAR(50) PRIMARY KEY,
                etapa VARCHAR(50) NOT NULL,
                dado_temporario TEXT
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS servicos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                preco NUMERIC(10, 2) NOT NULL
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS agendamentos (
                id SERIAL PRIMARY KEY,
                cliente_telefone VARCHAR(50) NOT NULL,
                servico_id INT NOT NULL,
                data_hora VARCHAR(50) NOT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        const resServicos = await pool.query('SELECT COUNT(*) FROM servicos');
        if (parseInt(resServicos.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO servicos (nome, preco) VALUES 
                ('Corte de Cabelo', 40.00),
                ('Barba', 30.00),
                ('Corte + Barba', 60.00);
            `);
        }
        console.log('Banco estruturado com sucesso!');
    } catch (err) {
        console.error('Erro ao inicializar o banco:', err);
    }
}

async function connectWhatsApp() {
    await inicializarBanco();
    const { state, saveCreds } = await usePostgresAuthState();
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    if (!sock.authState.creds.registered) {
        const phoneNumber = "555198049420";
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n========================================`);
                console.log(`🔑 SEU CÓDIGO DE PAREAMENTO: ${code}`);
                console.log(`========================================\n`);
            } catch (error) {
                console.error('Erro ao gerar código de pareamento:', error);
            }
        }, 5000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectWhatsApp();
        } else if (connection === 'open') {
            console.log('WhatsApp conectado com sucesso!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!messageText) return;

        const textoLimpo = messageText.toLowerCase().trim();

        try {
            let resEstado = await pool.query('SELECT etapa, dado_temporario FROM cliente_estado WHERE telefone = $1', [remoteJid]);
            let etapaAtual = resEstado.rows.length > 0 ? resEstado.rows[0].etapa : 'INICIO';

            const saudacoes = ['oi', 'olá', 'ola', 'menu', 'coé', 'coe', 'salve', 'e aí', 'e ai', 'fala', 'inicio'];
            const ehSaudacao = saudacoes.some(girling => textoLimpo.includes(girling));

            if (ehSaudacao || textoLimpo === 'menu') {
                etapaAtual = 'MENU_PRINCIPAL';
                await pool.query(`
                    INSERT INTO cliente_estado (telefone, etapa, dado_temporario) 
                    VALUES ($1, $2, NULL) 
                    ON CONFLICT (telefone) DO UPDATE SET etapa = $2, dado_temporario = NULL;
                `, [remoteJid, etapaAtual]);

                await sock.sendMessage(remoteJid, { 
                    text: '💈 *Sistema de Atendimento Inteligente*\n\nSeja bem-vindo! Como podemos ajudar?\n\n1️⃣ Ver Serviços e Agendar\n2️⃣ Falar com Atendente' 
                });
                return;
            }

            if (etapaAtual === 'MENU_PRINCIPAL') {
                if (textoLimpo === '1') {
                    const servicosRes = await pool.query('SELECT id, nome, preco FROM servicos ORDER BY id ASC');
                    let textoServicos = '✂️ *Escolha o serviço desejado digitando o número:*\n\n';
                    servicosRes.rows.forEach(s => {
                        textoServicos += `${s.id}️⃣ ${s.nome} - R$ ${Number(s.preco).toFixed(2)}\n`;
                    });

                    etapaAtual = 'ESCOLHENDO_SERVICO';
                    await pool.query('UPDATE cliente_estado SET etapa = $1 WHERE telefone = $2', [etapaAtual, remoteJid]);
                    await sock.sendMessage(remoteJid, { text: textoServicos });
                } else if (textoLimpo === '2') {
                    await sock.sendMessage(remoteJid, { text: '📞 Um atendente foi chamado e responderá em breve.' });
                    await pool.query('DELETE FROM cliente_estado WHERE telefone = $1', [remoteJid]);
                } else {
                    await sock.sendMessage(remoteJid, { text: '⚠️ Opção inválida. Digite *1* para serviços ou *2* para atendente.' });
                }
            } else if (etapaAtual === 'ESCOLHENDO_SERVICO') {
                const servicoId = parseInt(textoLimpo);
                const servicoRes = await pool.query('SELECT * FROM servicos WHERE id = $1', [servicoId]);

                if (servicoRes.rows.length > 0) {
                    const servicoEscolhido = servicoRes.rows[0].nome;
                    const horarioFixo = 'Hoje às 17:00';

                    await pool.query(
                        'INSERT INTO agendamentos (cliente_telefone, servico_id, data_hora) VALUES ($1, $2, $3)',
                        [remoteJid, servicoId, horarioFixo]
                    );

                    await sock.sendMessage(remoteJid, { 
                        text: `✅ *Agendamento Confirmado!*\n\nServiço: ${servicoEscolhido}\nHorário: ${horarioFixo}\n\nObrigado!` 
                    });
                    await pool.query('DELETE FROM cliente_estado WHERE telefone = $1', [remoteJid]);
                } else {
                    await sock.sendMessage(remoteJid, { text: '❌ Serviço não encontrado. Digite o número correspondente da lista.' });
                }
            } else {
                etapaAtual = 'MENU_PRINCIPAL';
                await pool.query(`
                    INSERT INTO cliente_estado (telefone, etapa, dado_temporario) 
                    VALUES ($1, $2, NULL) 
                    ON CONFLICT (telefone) DO UPDATE SET etapa = $2, dado_temporario = NULL;
                `, [remoteJid, etapaAtual]);
                await sock.sendMessage(remoteJid, { text: '👋 Olá! Digite *menu* para ver nossas opções.' });
            }
        } catch (err) {
            console.error('Erro:', err);
            await sock.sendMessage(remoteJid, { text: 'Ocorreu um erro interno. Envie *menu* novamente.' });
        }
    });
}

connectWhatsApp();
