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

  sock.ev.on('creds.update', saveCreds);
}

connectWhatsApp();

