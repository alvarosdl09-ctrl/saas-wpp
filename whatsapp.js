const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { usePostgresAuthState } = require('./postgresAuthState');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

async function connectWhatsApp() {
    const { state, saveCreds } = await usePostgresAuthState();

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    // Evento de Conexão e QR Code
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('Escaneie o QR Code abaixo com o seu WhatsApp:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada. Tentando reconectar...', shouldReconnect);
            if (shouldReconnect) {
                connectWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp conectado com sucesso e salvo no banco Neon!');
        }
    });

    // Salvar credenciais de autenticação
    sock.ev.on('creds.update', saveCreds);

    // ==========================================
    // O OUVINTE DE MENSAGENS (O Cérebro do Bot)
    // ==========================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        
        // Ignora mensagens enviadas pelo próprio bot/número
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid; // Número de quem mandou a mensagem
        
        // Pega o texto da mensagem (seja texto normal ou botão)
        const messageText = msg.message.conversation || 
                            msg.message.extendedTextMessage?.text;

        if (!messageText) return;

        console.log(`Mensagem recebida de ${remoteJid}: ${messageText}`);

        const textoLimpo = messageText.toLowerCase().trim();

        // Respostas automáticas iniciais de teste
        if (textoLimpo === 'olá' || textoLimpo === 'oi' || textoLimpo === 'menu') {
            await sock.sendMessage(remoteJid, { 
                text: '👋 Olá! Seja bem-vindo ao nosso sistema de atendimento automatizado.\n\nComo posso te ajudar hoje?\n1️⃣ Ver horários disponíveis\n2️⃣ Falar com atendente' 
            });
        } else if (textoLimpo === '1') {
            await sock.sendMessage(remoteJid, { 
                text: '📅 Aqui estão os horários disponíveis para hoje:\n- 14:00\n- 15:30\n- 17:00\n\nResponda com o horário desejado.' 
            });
        } else {
            await sock.sendMessage(remoteJid, { 
                text: 'Recebi sua mensagem! Em breve nosso sistema de agendamento completo estará respondendo por aqui.' 
            });
        }
    });
}

connectWhatsApp();

