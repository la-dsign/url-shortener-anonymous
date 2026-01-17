# 🔗 ShortLink - Acortador de URLs Profesional y Anónimo

Un servicio moderno y profesional para acortar URLs sin necesidad de registro. Completamente anónimo y con estadísticas básicas.

## ✨ Características

- 🔒 **Completamente anónimo** - No requiere registro ni información personal
- ⚡ **Rápido y eficiente** - Acorta URLs instantáneamente
- 📊 **Estadísticas básicas** - Visualiza el número de clics en tus enlaces
- 🎨 **Interfaz moderna** - Diseño limpio y responsive
- 💾 **Base de datos SQLite** - Ligera y sin configuración adicional
- 🔐 **Códigos únicos** - Genera códigos cortos de 7 caracteres

## 🚀 Instalación

1. **Clona o descarga el proyecto**

2. **Instala las dependencias:**
```bash
npm install
```

3. **Inicia el servidor:**
```bash
npm start
```

4. **Para desarrollo con auto-recarga:**
```bash
npm run dev
```

5. **Abre tu navegador en:**
```
http://localhost:3000
```

## 📁 Estructura del Proyecto

```
url-shortener/
├── server.js              # Servidor Express y API
├── package.json           # Dependencias y scripts
├── urls.db               # Base de datos SQLite (se crea automáticamente)
├── public/
│   ├── index.html        # Página principal
│   ├── stats.html        # Página de estadísticas
│   ├── 404.html          # Página de error
│   ├── styles.css        # Estilos CSS
│   └── script.js         # JavaScript del frontend
└── README.md
```

## 🔧 API Endpoints

### Acortar URL
```
POST /api/shorten
Content-Type: application/json

{
  "url": "https://ejemplo.com/pagina-muy-larga"
}

Respuesta:
{
  "shortUrl": "http://localhost:3000/abc1234",
  "shortCode": "abc1234"
}
```

### Obtener Estadísticas
```
GET /api/stats/:shortCode

Respuesta:
{
  "originalUrl": "https://ejemplo.com/pagina-muy-larga",
  "clicks": 42,
  "createdAt": "2026-01-17T10:30:00.000Z"
}
```

### Redirección
```
GET /:shortCode
Redirige a la URL original
```

## 🛠️ Tecnologías Utilizadas

- **Backend:**
  - Node.js
  - Express.js
  - better-sqlite3 (Base de datos)
  - validator (Validación de URLs)
  - nanoid (Generación de códigos únicos)

- **Frontend:**
  - HTML5
  - CSS3 (con variables CSS y Grid/Flexbox)
  - JavaScript vanilla (ES6+)

## 🔒 Seguridad y Privacidad

- No se almacena información personal
- No hay sistema de cuentas o autenticación
- Las URLs se almacenan de forma anónima
- Validación estricta de URLs
- Protección contra códigos duplicados

## 📊 Base de Datos

La aplicación utiliza SQLite con la siguiente estructura:

```sql
CREATE TABLE urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    clicks INTEGER DEFAULT 0
)
```

## 🌐 Despliegue en Producción

Para desplegar en producción:

1. Configura la variable de entorno `PORT`
2. Asegúrate de que el dominio esté correctamente configurado
3. Considera usar un proxy reverso (nginx)
4. Implementa límites de tasa (rate limiting)
5. Configura HTTPS

## 📝 Licencia

MIT

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor abre un issue primero para discutir los cambios que te gustaría realizar.

---

Desarrollado con ❤️ para la comunidad
