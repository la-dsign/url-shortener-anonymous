const urlInput = document.getElementById('urlInput');
const shortenBtn = document.getElementById('shortenBtn');
const errorDiv = document.getElementById('error');
const resultDiv = document.getElementById('result');
const shortUrlInput = document.getElementById('shortUrl');
const copyBtn = document.getElementById('copyBtn');
const statsLink = document.getElementById('statsLink');
const btnText = document.querySelector('.btn-text');
const btnLoading = document.querySelector('.btn-loading');

// Acortar URL
shortenBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();

    // Limpiar mensajes anteriores
    errorDiv.style.display = 'none';
    resultDiv.style.display = 'none';

    // Validación básica
    if (!url) {
        showError('Por favor ingresa una URL');
        return;
    }

    // Validar que tenga protocolo
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showError('La URL debe comenzar con http:// o https://');
        return;
    }

    // Mostrar estado de carga
    setLoading(true);

    try {
        const response = await fetch('/api/shorten', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al acortar la URL');
        }

        // Mostrar resultado
        shortUrlInput.value = data.shortUrl;
        statsLink.href = `/stats.html?code=${data.shortCode}`;
        resultDiv.style.display = 'block';

        // Limpiar input
        urlInput.value = '';

    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(false);
    }
});

// Copiar al portapapeles
copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(shortUrlInput.value);
        
        // Cambiar texto del botón
        const copyText = copyBtn.querySelector('.copy-text');
        const originalText = copyText.textContent;
        copyText.textContent = '¡Copiado!';
        copyBtn.classList.add('copied');

        setTimeout(() => {
            copyText.textContent = originalText;
            copyBtn.classList.remove('copied');
        }, 2000);

    } catch (error) {
        // Fallback para navegadores antiguos
        shortUrlInput.select();
        document.execCommand('copy');
        
        const copyText = copyBtn.querySelector('.copy-text');
        copyText.textContent = '¡Copiado!';
        copyBtn.classList.add('copied');

        setTimeout(() => {
            copyText.textContent = 'Copiar';
            copyBtn.classList.remove('copied');
        }, 2000);
    }
});

// Enter para acortar
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        shortenBtn.click();
    }
});

// Funciones auxiliares
function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'flex';
}

function setLoading(loading) {
    shortenBtn.disabled = loading;
    btnText.style.display = loading ? 'none' : 'inline';
    btnLoading.style.display = loading ? 'flex' : 'none';
}
