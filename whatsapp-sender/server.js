const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── WhatsApp Client ───
let client = null;
let qrCodeData = null;
let isReady = false;
let isAuthenticated = false;

function initWhatsApp() {
  if (client) {
    client.destroy();
  }

  client = new Client({
    authStrategy: new LocalAuth({ clientId: 'nexaroz' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu']
    }
  });

  client.on('qr', async (qr) => {
    try {
      qrCodeData = await qrcode.toDataURL(qr);
      isAuthenticated = false;
      isReady = false;
      io.emit('qr', { qr: qrCodeData });
      console.log('QR code generated');
    } catch (err) {
      console.error('QR generation error:', err);
    }
  });

  client.on('authenticated', () => {
    isAuthenticated = true;
    console.log('WhatsApp authenticated');
  });

  client.on('ready', () => {
    isReady = true;
    console.log('WhatsApp client ready');
    io.emit('ready', { message: 'WhatsApp is connected and ready!' });
  });

  client.on('disconnected', (reason) => {
    isReady = false;
    console.log('WhatsApp disconnected:', reason);
    io.emit('disconnected', { message: 'WhatsApp disconnected. Reconnecting...' });
    // Auto-reconnect
    setTimeout(() => {
      if (!isReady) {
        try { client.initialize(); } catch (e) {}
      }
    }, 5000);
  });

  client.initialize();
}

// ─── API Routes ───

// Get status
app.get('/api/status', (req, res) => {
  res.json({
    ready: isReady,
    authenticated: isAuthenticated,
    hasQr: !!qrCodeData,
    qr: qrCodeData
  });
});

// Restart client (force new QR)
app.post('/api/reconnect', (req, res) => {
  initWhatsApp();
  res.json({ success: true });
});

// Send messages in bulk
app.post('/api/send', async (req, res) => {
  const { messages } = req.body; // [{phone, message, id}]

  if (!isReady) {
    return res.status(400).json({ error: 'WhatsApp not connected. Scan QR code first.' });
  }

  if (!messages || !messages.length) {
    return res.status(400).json({ error: 'No messages to send.' });
  }

  // Process in batches of 3 with delays to avoid rate limiting
  const results = [];
  const batchSize = 3;
  const delayMs = 3000;

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const batchPromises = batch.map(async (msg) => {
      try {
        const number = msg.phone.startsWith('91') ? msg.phone : '91' + msg.phone;
        const chatId = `${number}@c.us`;
        const response = await client.sendMessage(chatId, msg.message);
        console.log(`✓ Sent to ${number}`);
        return { id: msg.id, phone: msg.phone, success: true };
      } catch (err) {
        console.error(`✗ Failed to send to ${msg.phone}:`, err.message);
        return { id: msg.id, phone: msg.phone, success: false, error: err.message };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Notify progress
    io.emit('progress', {
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      total: messages.length,
      results: batchResults
    });

    // Wait between batches
    if (i + batchSize < messages.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  res.json({ success: true, results });
});

// ─── Start ───
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  ◆ Nexaroz WhatsApp Sender running!`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Open: http://localhost:${PORT}\n`);
  initWhatsApp();
});
