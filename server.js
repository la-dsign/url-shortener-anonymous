const express = require('express');
const Database = require('better-sqlite3');
const validator = require('validator');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : '';

// Base de datos SQLite
const db = new Database('urls.db');

// Crear tabla si no existe
db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    clicks INTEGER DEFAULT 0
  )
`);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Headers de privacidad
app.use((req, res, next) => {
  // No almacenar caché con información sensible
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  // Prevenir que el navegador envíe el referer
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Seguridad adicional
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Desactivar logs de servidor (comentar para desarrollo)
app.set('trust proxy', false);

// API: Acortar URL
app.post('/api/shorten', (req, res) => {
  const { url } = req.body;

  // Validar URL
  if (!url || !validator.isURL(url, { require_protocol: true })) {
    return res.status(400).json({ 
      error: 'URL inválida. Asegúrate de incluir http:// o https://' 
    });
  }

  try {
    // Verificar si la URL ya existe
    const existing = db.prepare('SELECT short_code FROM urls WHERE original_url = ?').get(url);
    
    if (existing) {
      return res.json({
        shortUrl: `${req.protocol}://${req.get('host')}/${existing.short_code}`,
        shortCode: existing.short_code
      });
    }

    // Generar código corto único
    let shortCode;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      shortCode = nanoid(7); // Código de 7 caracteres
      attempts++;
      
      if (attempts > maxAttempts) {
        throw new Error('No se pudo generar un código único');
      }
    } while (db.prepare('SELECT id FROM urls WHERE short_code = ?').get(shortCode));

    // Insertar en la base de datos
    const insert = db.prepare('INSERT INTO urls (short_code, original_url) VALUES (?, ?)');
    insert.run(shortCode, url);
    
    res.json({
      shortUrl: `${req.protocol}://${req.get('host')}/${shortCode}`,
      shortCode: shortCode
    });
  } catch (error) {
    // Log de error sin información del usuario
    console.error('Error al acortar URL');
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// API: Obtener estadísticas (opcional)
app.get('/api/stats/:shortCode', (req, res) => {
  const { shortCode } = req.params;

  try {
    const url = db.prepare('SELECT original_url, clicks, created_at FROM urls WHERE short_code = ?').get(shortCode);

    if (!url) {
      return res.status(404).json({ error: 'URL no encontrada' });
    }

    res.json({
      originalUrl: url.original_url,
      clicks: url.clicks,
      createdAt: url.created_at
    });
  } catch (error) {
    // Log de error sin información del usuario
    console.error('Error al obtener estadísticas');
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// Redirección: Redirigir URL corta a original
app.get('/:shortCode', (req, res) => {
  const { shortCode } = req.params;

  try {
    const url = db.prepare('SELECT original_url FROM urls WHERE short_code = ?').get(shortCode);

    if (!url) {
      return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }

    // Incrementar contador de clics (sin guardar ninguna información del visitante)
    db.prepare('UPDATE urls SET clicks = clicks + 1 WHERE short_code = ?').run(shortCode);

    // Redirigir sin pasar información del referer
    res.redirect(301, url.original_url);
  } catch (error) {
    // Log de error sin información del usuario
    console.error('Error en redirección');
    res.status(500).send('Error al procesar la solicitud');
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor de acortador de URLs iniciado en http://localhost:${PORT}`);
  console.log(`📊 Base de datos SQLite inicializada`);
});

// Cerrar base de datos al terminar
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
