const API_URL = 'http://localhost:3000';


const loadingSpinner = document.getElementById('loadingSpinner');
const contratosGrid = document.getElementById('contratosGrid');
const noResults = document.getElementById('noResults');
const totalContratos = document.getElementById('totalContratos');
const resultadosCount = document.getElementById('resultadosCount');
const searchProveedor = document.getElementById('searchProveedor');
const searchNumero = document.getElementById('searchNumero');
const btnBuscar = document.getElementById('btnBuscar');

const btnLimpiar = document.getElementById('btnLimpiar');

document.addEventListener('DOMContentLoaded', cargarContratos);
btnBuscar.addEventListener('click', cargarContratos);
btnLimpiar.addEventListener('click', () => {
    searchProveedor.value = '';
    searchNumero.value = '';
    cargarContratos();
});

searchProveedor.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') cargarContratos();
});

searchNumero.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') cargarContratos();
});

async function cargarContratos() {
    mostrarLoading();

    const params = new URLSearchParams();
    if (searchProveedor.value.trim()) params.append('proveedor', searchProveedor.value.trim());
    if (searchNumero.value.trim()) params.append('numeroContrato', searchNumero.value.trim());

    const url = `${API_URL}/api/contratos${params.toString() ? '?' + params.toString() : ''}`;

    console.log('📡 Consultando:', url);

    try {
        const response = await fetch(url);
        const data = await response.json();

        console.log('✅ Respuesta:', data);

        if (data.ok && data.contratos) {
            mostrarContratos(data.contratos);
        } else {
            mostrarError('Error al cargar contratos');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarError('Error de conexión');
    }
}

function mostrarContratos(contratos) {
    ocultarLoading();

    if (contratos.length === 0) {
        contratosGrid.innerHTML = '';
        noResults.style.display = 'block';
        totalContratos.textContent = '0';
        resultadosCount.textContent = '0';
        return;
    }

    noResults.style.display = 'none';
    totalContratos.textContent = contratos.length;
    resultadosCount.textContent = contratos.length;

    contratosGrid.innerHTML = contratos.map(c => `
        <div class="contrato-card" data-id="${c.id}">
            <div class="contrato-numero">${c.numeroContrato}</div>
            ${c.tipoContrato ? `<span class="contrato-tipo">${c.tipoContrato}</span>` : ''}
            <div class="contrato-proveedor">${c.proveedor}</div>
            <div class="contrato-fecha">📅 ${formatearFecha(c.fechaInforme)}</div>
            <div class="contrato-footer">
                <span class="contrato-id">ID: ${c.id.substring(0, 8)}...</span>
                <button class="btn-ver" type="button">Ver →</button>

            </div>
        </div>
    `).join('');

    // Event listeners después de crear el HTML
    document.querySelectorAll('.contrato-card').forEach(card => {
        card.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            console.log('🔗 ID capturado:', id);
             localStorage.setItem('contratoId', id);
            console.log('🔗 Redirigiendo a: detalle.html?id=' + id);
            window.location.href = '/pages/detalle';
        });
    });
}

function formatearFecha(fecha) {
    if (!fecha) return 'Sin fecha';
    return new Date(fecha).toLocaleDateString('es-CO');
}

function mostrarLoading() {
    loadingSpinner.style.display = 'flex';
    contratosGrid.innerHTML = '';
    noResults.style.display = 'none';
}

function ocultarLoading() {
    loadingSpinner.style.display = 'none';
}

function mostrarError(msg) {
    ocultarLoading();
    contratosGrid.innerHTML = `
        <div style="text-align:center;padding:40px;color:#721c24;grid-column:1/-1;background:#f8d7da;border-radius:12px;">
            <h3>⚠️ ${msg}</h3>
            <button onclick="cargarContratos()" style="margin-top:20px;padding:10px 20px;background:#667eea;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                🔄 Reintentar
            </button>
        </div>
    `;
}
