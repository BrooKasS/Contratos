const API_URL = 'http://localhost:3000';

const fileInput = document.getElementById('fileInput');
const fileLabel = document.getElementById('fileLabel');
const uploadBtn = document.getElementById('uploadBtn');
const uploadForm = document.getElementById('uploadForm');
const message = document.getElementById('message');
const btnText = document.getElementById('btnText');
const btnLoader = document.getElementById('btnLoader');

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        fileLabel.querySelector('.file-text').textContent = file.name;
        fileLabel.style.borderColor = '#28a745';
        fileLabel.style.background = '#e8f5e9';
        uploadBtn.disabled = false;
    } else {
        fileLabel.querySelector('.file-text').textContent = 'Seleccionar archivo';
        fileLabel.style.borderColor = '#667eea';
        fileLabel.style.background = '#f8f9ff';
        uploadBtn.disabled = true;
    }
});

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const file = fileInput.files[0];
    if (!file) {
        mostrarMensaje('Selecciona un archivo', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('informe', file);

    uploadBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline';
    message.style.display = 'none';

    try {
        const response = await fetch(`${API_URL}/api/upload/contrato`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensaje(`✅ Contrato subido: ${data.resumen.numeroContrato}`, 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } else {
            mostrarMensaje(`❌ ${data.error || 'Error al subir'}`, 'error');
            uploadBtn.disabled = false;
        }
    } catch (error) {
        console.error(error);
        mostrarMensaje('❌ Error de conexión con el servidor', 'error');
        uploadBtn.disabled = false;
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
    }
});

function mostrarMensaje(texto, tipo) {
    message.textContent = texto;
    message.className = `message ${tipo}`;
    message.style.display = 'block';
}