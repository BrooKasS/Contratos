const API_URL = 'http://localhost:3001';

const loadingSpinner = document.getElementById('loadingSpinner');
const contratosGrid = document.getElementById('contratosGrid');
const noResults = document.getElementById('noResults');
const totalContratos = document.getElementById('totalContratos');
const resultadosCount = document.getElementById('resultadosCount');
const btnRecargar = document.getElementById('btnRecargar');
const btnExportar = document.getElementById('btnExportar');
const btnFiltros = document.getElementById('btnFiltros');
const modalFiltros = document.getElementById('modalFiltros');
const filtroProveedor = document.getElementById('filtroProveedor');
const filtroNumero = document.getElementById('filtroNumeroContrato');

let contratosData = [];

// Función normalize (para normalizar textos: minúsculas, quitar acentos, etc.)
function normalize(text) {
    return text
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

/**************************************************
 * EVENTOS
 **************************************************/
document.addEventListener('DOMContentLoaded', cargarContratos);

btnFiltros.addEventListener('click', abrirModalFiltros);
btnRecargar.addEventListener('click', cargarContratos);
btnExportar.addEventListener('click', exportarExcel); // Placeholder, implementa si es necesario

/**************************************************
 * FETCH CONTRATOS
 **************************************************/
async function cargarContratos() {
    mostrarLoading();

    const proveedor = filtroProveedor.value.trim();
    const numero = filtroNumero.value.trim();

    const params = new URLSearchParams();
    if (proveedor) {
        params.append('proveedor', proveedor);
    }
    if (numero) {
        params.append('numeroContrato', numero);
    }

    const url = `${API_URL}/api/contratos${params.toString() ? '?' + params.toString() : ''}`;
    console.log('📡 Consultando:', url);

    try {
        const response = await fetch(url);
        const data = await response.json();

        console.log('✅ Respuesta:', data);

        if (data.ok && Array.isArray(data.contratos)) {
            contratosData = data.contratos;
            popularListasSugerencias(); // Popular sugerencias en modal
            mostrarContratos(contratosData);
        } else {
            mostrarError('Error al cargar contratos');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarError('Error de conexión');
    }
}

/**************************************************
 * RENDER CONTRATOS
 **************************************************/
function mostrarContratos(contratos) {
    ocultarLoading();

    if (!contratos.length) {
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

    /**************************************************
     * REDIRECCIÓN CORRECTA (CON ID EN URL)
     **************************************************/
    document.querySelectorAll('.contrato-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.getAttribute('data-id');
            console.log('🔗 Redirigiendo a detalle con ID:', id);
            window.location.href = `/pages/detalle.html#id=${id}`;
        });
    });
}

/**************************************************
 * MODAL FILTROS
 **************************************************/
function abrirModalFiltros() {
    modalFiltros.style.display = 'flex';
}

function cerrarModalFiltros() {
    modalFiltros.style.display = 'none';
}

function limpiarFiltros() {
    filtroProveedor.value = '';
    filtroNumero.value = '';
    aplicarFiltros();
}

function aplicarFiltros() {
    cargarContratos();
    cerrarModalFiltros();
}

/**************************************************
 * AUTOCOMPLETE PARA FILTROS
 **************************************************/
function popularListasSugerencias() {
    // Números de contrato únicos
    const numerosUnicos = [...new Set(contratosData.map(c => c.numeroContrato).filter(Boolean))];

    // Proveedores únicos
    const proveedoresUnicos = [...new Set(contratosData.map(c => c.proveedor).filter(Boolean))];

    setupAutocomplete('filtroNumeroContrato', 'autoCompleteNumero', numerosUnicos);
    setupAutocomplete('filtroProveedor', 'autoCompleteProveedor', proveedoresUnicos);
}

function setupAutocomplete(inputId, listId, dataList) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);

    function showSuggestions(suggestions) {
        list.innerHTML = '';
        suggestions.forEach(sug => {
            const div = document.createElement('div');
            div.textContent = sug;
            div.addEventListener('click', () => {
                input.value = sug;
                list.style.display = 'none';
            });
            list.appendChild(div);
        });
        list.style.display = suggestions.length ? 'block' : 'none';
    }

    input.addEventListener('focus', () => showSuggestions(dataList));

    input.addEventListener('input', () => {
        const val = normalize(input.value);
        const filtered = dataList.filter(item => normalize(item).includes(val));
        showSuggestions(filtered);
    });

    document.addEventListener('click', e => {
        if (e.target !== input) list.style.display = 'none';
    });
}

/**************************************************
 * HELPERS
 **************************************************/
function formatearFecha(fecha) {
    if (!fecha || fecha === '') return 'Sin fecha';
    
    // Sanitiza encoding
    fecha = String(fecha).replace(/A�O/g, 'AÑO').replace(/D�A/g, 'DÍA').replace(/�/g, 'Ñ');
    
    //  Si tiene el símbolo + es una duración
    if (fecha.includes('+')) {
        return fecha;
    }
    
    //  Si contiene palabras de duración
    if (/AÑO|ANO|MES|DIA/i.test(fecha)) {
        return fecha;
    }
    
    //  Si tiene formato ISO completo con T (ej: 2025-06-27T00:00:00.000Z)
    // Extraer solo la parte de la fecha YYYY-MM-DD y formatear manualmente
    if (/^\d{4}-\d{2}-\d{2}T/.test(fecha)) {
        const fechaSolo = fecha.split('T')[0]; // "2025-06-27"
        const [year, month, day] = fechaSolo.split('-');
        return `${parseInt(day)}/${parseInt(month)}/${year}`; // "27/6/2025"
    }
    
    //  Si tiene formato YYYY-MM-DD (sin hora)
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const [year, month, day] = fecha.split('-');
        return `${parseInt(day)}/${parseInt(month)}/${year}`; // "27/6/2025"
    }
    
    //  Solo intentar parsear si parece una fecha (tiene números y separadores)
    const datePattern = /^\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}$/;
    if (!datePattern.test(fecha.trim())) {
        return fecha; // No parece una fecha, retorna raw
    }
    
    const date = new Date(fecha);
    if (isNaN(date.getTime())) {
        return fecha; // No es fecha válida
    }
    
    return date.toLocaleDateString('es-CO');
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
        <div style="
            text-align:center;
            padding:40px;
            color:#721c24;
            grid-column:1/-1;
            background:#f8d7da;
            border-radius:12px;
        ">
            <h3>⚠️ ${msg}</h3>
            <button onclick="cargarContratos()"
                style="
                    margin-top:20px;
                    padding:10px 20px;
                    background:#667eea;
                    color:white;
                    border:none;
                    border-radius:8px;
                    cursor:pointer;
                    font-weight:600;
                ">
                🔄 Reintentar
            </button>
        </div>
    `;
}

// Placeholder para exportarExcel
function exportarExcel() {
    alert('📥 Funcionalidad en desarrollo');
}