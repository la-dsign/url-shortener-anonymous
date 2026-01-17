const express = require('express');
const Database = require('better-sqlite3');
const validator = require('validator');
const { nanoid } = require('nanoid');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : '';
const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambialo-en-produccion';

// Base de datos SQLite
// En producción (Render), usar /opt/render/project/src para persistencia
const dbPath = process.env.NODE_ENV === 'production' 
  ? path.join(__dirname, 'urls.db')
  : 'urls.db';

console.log('📁 Database path:', dbPath);

let db;
try {
  db = new Database(dbPath);
  console.log('✅ Database connection successful');
  
  // Crear tablas si no existen
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      short_code TEXT UNIQUE NOT NULL,
      original_url TEXT NOT NULL,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      clicks INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  console.log('✅ Database tables initialized');
} catch (error) {
  console.error('❌ Database initialization error:', error.message);
  console.error('Current directory:', __dirname);
  process.exit(1);
}

// Middleware
app.use(express.json());
app.use(cookieParser());
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

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
};

const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticación requerida' });
  }
  next();
};

// API: Registro de usuario
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const insert = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
    const result = insert.run(username, email, hashedPassword);

    const token = jwt.sign({ id: result.lastInsertRowid, username, email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ message: 'Usuario registrado exitosamente', user: { id: result.lastInsertRowid, username, email } });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'El usuario o email ya existe' });
    }
    console.error('Error en registro');
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// API: Login de usuario
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ message: 'Login exitoso', user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('Error en login');
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// API: Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout exitoso' });
});

// API: Obtener usuario actual
app.get('/api/auth/me', authenticateToken, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  res.json({ user: req.user });
});

// API: Acortar URL
app.post('/api/shorten', authenticateToken, (req, res) => {
  const { url, expiresIn } = req.body;

  // Validar URL
  if (!url || !validator.isURL(url, { require_protocol: true })) {
    return res.status(400).json({ 
      error: 'URL inválida. Asegúrate de incluir http:// o https://' 
    });
  }

  try {
    const userId = req.user ? req.user.id : null;
    
    // Calcular fecha de expiración si se especifica
    let expiresAt = null;
    if (expiresIn && userId) {
      const now = new Date();
      switch(expiresIn) {
        case '1h':
          expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
          break;
        case '24h':
          expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
          break;
        case '7d':
          expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case '30d':
          expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
      }
    }
    
    // Verificar si la URL ya existe para este usuario
    let existing;
    if (userId) {
      existing = db.prepare('SELECT short_code FROM urls WHERE original_url = ? AND user_id = ? AND is_active = 1').get(url, userId);
    }
    
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
    const insert = db.prepare('INSERT INTO urls (short_code, original_url, user_id, expires_at) VALUES (?, ?, ?, ?)');
    insert.run(shortCode, url, userId, expiresAt);
    
    res.json({
      shortUrl: `${req.protocol}://${req.get('host')}/${shortCode}`,
      shortCode: shortCode
    });
  } catch (error) {
    // Log de error sin información del usuario
    console.error('Error al acortar URL:', error.message);
    res.status(500).json({ error: 'Error al procesar la solicitud: ' + error.message });
  }
});

// API: Obtener todas las URLs del usuario
app.get('/api/my-urls', authenticateToken, requireAuth, (req, res) => {
  try {
    const urls = db.prepare('SELECT id, short_code, original_url, clicks, created_at, expires_at, is_active FROM urls WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ urls });
  } catch (error) {
    console.error('Error al obtener URLs');
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// API: Eliminar URL
app.delete('/api/urls/:shortCode', authenticateToken, requireAuth, (req, res) => {
  const { shortCode } = req.params;
  
  try {
    // Verificar que el enlace pertenece al usuario
    const url = db.prepare('SELECT id FROM urls WHERE short_code = ? AND user_id = ?').get(shortCode, req.user.id);
    
    if (!url) {
      return res.status(404).json({ error: 'Enlace no encontrado' });
    }
    
    // Marcar como inactivo en lugar de eliminar (para mantener estadísticas)
    db.prepare('UPDATE urls SET is_active = 0 WHERE short_code = ? AND user_id = ?').run(shortCode, req.user.id);
    
    res.json({ message: 'Enlace eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar URL');
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
});

// API: Actualizar expiración de URL
app.patch('/api/urls/:shortCode', authenticateToken, requireAuth, (req, res) => {
  const { shortCode } = req.params;
  const { expiresIn } = req.body;
  
  try {
    // Verificar que el enlace pertenece al usuario
    const url = db.prepare('SELECT id FROM urls WHERE short_code = ? AND user_id = ?').get(shortCode, req.user.id);
    
    if (!url) {
      return res.status(404).json({ error: 'Enlace no encontrado' });
    }
    
    // Calcular nueva fecha de expiración
    let expiresAt = null;
    if (expiresIn && expiresIn !== 'never') {
      const now = new Date();
      switch(expiresIn) {
        case '1h':
          expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
          break;
        case '24h':
          expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
          break;
        case '7d':
          expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case '30d':
          expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
      }
    }
    
    db.prepare('UPDATE urls SET expires_at = ? WHERE short_code = ? AND user_id = ?').run(expiresAt, shortCode, req.user.id);
    
    res.json({ message: 'Expiración actualizada exitosamente' });
  } catch (error) {
    console.error('Error al actualizar URL');
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
    const url = db.prepare('SELECT original_url, expires_at, is_active FROM urls WHERE short_code = ?').get(shortCode);

    if (!url || !url.is_active) {
      return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }

    // Verificar si el enlace ha expirado
    if (url.expires_at) {
      const now = new Date();
      const expiresAt = new Date(url.expires_at);
      
      if (now > expiresAt) {
        // Marcar como inactivo
        db.prepare('UPDATE urls SET is_active = 0 WHERE short_code = ?').run(shortCode);
        return res.status(410).sendFile(path.join(__dirname, 'public', 'expired.html'));
      }
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
