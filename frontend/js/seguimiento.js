const API_URL = 'http://localhost:3001';
const loadingSpinner = document.getElementById('loadingSpinner');
const tableContainer = document.getElementById('tableContainer');
const tableBody = document.getElementById('tableBody');
const noResults = document.getElementById('noResults');
const btnRecargar = document.getElementById('btnRecargar');
const btnExportar = document.getElementById('btnExportar');
const modalEditar = document.getElementById('modalEditar');
const btnFiltros = document.getElementById('btnFiltros');
const modalFiltros = document.getElementById('modalFiltros');

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

document.addEventListener('DOMContentLoaded', cargarSeguimiento);

// Eventos
btnRecargar.addEventListener('click', cargarSeguimiento);
btnExportar.addEventListener('click', exportarExcel);
btnFiltros.addEventListener('click', abrirModalFiltros);

// Cargar seguimiento desde la API
async function cargarSeguimiento() {
    mostrarLoading();

    try {
        const response = await fetch(`${API_URL}/api/seguimiento`);
        const data = await response.json();

        console.log('✅ Datos de seguimiento:', data);

        if (data.ok && data.contratos) {
            contratosData = data.contratos;
            popularListasSugerencias(); // Popular datalists con sugerencias
            mostrarTabla(contratosData);
        } else {
            mostrarError();
        }
    } catch (error) {
        console.error('❌ Error cargando seguimiento:', error);
        mostrarError();
    }
}

// Popular datalists con valores únicos para autocompletado
function popularListasSugerencias() {
    // Números de contrato únicos
    const numerosUnicos = [...new Set(contratosData.map(c => c.numeroContrato).filter(Boolean))];

    // Proveedores únicos
    const proveedoresUnicos = [...new Set(contratosData.map(c => c.proveedor).filter(Boolean))];

    // Abogados únicos
    const abogadosUnicos = [...new Set(contratosData.map(c => c.abogadoResponsable).filter(Boolean))];

    // Novedades únicas (tomamos palabras clave únicas, pero para simplicidad, tomamos novedades completas si no son muy largas)
    const novedadesUnicas = [...new Set(contratosData.map(c => c.novedad).filter(Boolean))];

    // Setup custom autocomplete
    setupAutocomplete('filtroNumeroContrato', 'autoCompleteNumero', numerosUnicos);
    setupAutocomplete('filtroProveedor', 'autoCompleteProveedor', proveedoresUnicos);
    setupAutocomplete('filtroAbogado', 'autoCompleteAbogado', abogadosUnicos);
    setupAutocomplete('filtroNovedad', 'autoCompleteNovedad', novedadesUnicas);
}

// Función para crear autocomplete custom
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

// Abrir modal de filtros
function abrirModalFiltros() {
    modalFiltros.style.display = 'flex';
}

// Cerrar modal de filtros
function cerrarModalFiltros() {
    modalFiltros.style.display = 'none';
}

// Limpiar filtros
function limpiarFiltros() {
    document.getElementById('filtroNumeroContrato').value = '';
    document.getElementById('filtroProveedor').value = '';
    document.getElementById('filtroAbogado').value = '';
    document.getElementById('filtroEstado').value = '';
    document.getElementById('filtroNovedad').value = '';
    document.getElementById('filtroFechaDesde').value = '';
    document.getElementById('filtroFechaHasta').value = '';
    aplicarFiltros(); // Aplicar para mostrar todo
}

// Aplicar filtros y filtrar la tabla
function aplicarFiltros() {
    const numContrato = normalize(document.getElementById('filtroNumeroContrato').value);
    const proveedor = normalize(document.getElementById('filtroProveedor').value);
    const abogado = normalize(document.getElementById('filtroAbogado').value);
    const estado = document.getElementById('filtroEstado').value;
    const novedad = normalize(document.getElementById('filtroNovedad').value);
    const fechaDesde = document.getElementById('filtroFechaDesde').value ? new Date(document.getElementById('filtroFechaDesde').value) : null;
    const fechaHasta = document.getElementById('filtroFechaHasta').value ? new Date(document.getElementById('filtroFechaHasta').value) : null;

    const contratosFiltrados = contratosData.filter(c => {
        const matchNum = !numContrato || normalize(c.numeroContrato).includes(numContrato);
        const matchAbogado = !abogado || normalize(c.abogadoResponsable || '').includes(abogado);
        const matchProv = !proveedor || normalize(c.proveedor).includes(proveedor);
        const matchEstado = !estado || c.estadoContrato === estado;
        const matchNov = !novedad || normalize(c.novedad || '').includes(novedad);
        
        let matchFecha = true;
        if (fechaDesde || fechaHasta) {
            const fechaNov = c.fechaNovedad ? new Date(c.fechaNovedad) : null;
            if (fechaNov) {
                if (fechaDesde && fechaNov < fechaDesde) matchFecha = false;
                if (fechaHasta && fechaNov > fechaHasta) matchFecha = false;
            } else {
                matchFecha = false;
            }
        }

        return matchNum && matchProv && matchAbogado && matchEstado && matchNov && matchFecha;
    });

    mostrarTabla(contratosFiltrados);
    cerrarModalFiltros();
}

// Mostrar tabla con contratos (originales o filtrados)
function mostrarTabla(contratos) {
    ocultarLoading();

    if (contratos.length === 0) {
        noResults.style.display = 'block';
        tableContainer.style.display = 'none';
        return;
    }

    noResults.style.display = 'none';
    tableContainer.style.display = 'block';

    tableBody.innerHTML = contratos.map(c => {
        const gen = c.generalidades?.generalidades || {};
        const principal = c.principal?.contrato || {};
        const vinculados = gen.certificacionUnidadVinculados || {};
        const crpData = c.crp || {};
        
        return `
            <tr>
                <td class="cell-number">${c.numeroContrato}</td>
                <td><strong>${c.proveedor}</strong></td>
                <td class="cell-multiline">${formatearVinculados(vinculados)}</td>
                <td class="cell-multiline">${formatearVigencia(principal)}</td>
                <td>${c.abogadoResponsable || '<span style="color:#999">Sin asignar</span>'}</td>
                <td>${gen.representanteLegal || '-'}</td>
                <td>${formatearEstado(c.estadoContrato)}</td>
                <td>${c.sistema || '-'}</td>
                <td class="cell-truncate" title="${c.novedad || ''}">${c.novedad || '-'}</td>
                <td>${formatearFecha(c.fechaNovedad)}</td>
                <td><strong>${formatearMoneda(crpData.totalCRP)}</strong></td>
                <td class="cell-truncate" title="${gen.objetoContrato || ''}">${gen.objetoContrato || '-'}</td>
                <td>
                    <button class="btn-edit" onclick="abrirModal('${c.id}')">✏️ Editar</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Abrir modal de edición
function abrirModal(id) {
    const contrato = contratosData.find(c => c.id === id);
    if (!contrato) {
        console.error('Contrato no encontrado:', id);
        return;
    }

    const gen = contrato.generalidades?.generalidades || {};

    // Rellenar campos del modal
    document.getElementById('editContratoId').value = id;
    document.getElementById('editNumeroContrato').value = contrato.numeroContrato;
    document.getElementById('editProveedor').value = contrato.proveedor;
    document.getElementById('editAbogado').value = contrato.abogadoResponsable || '';
    document.getElementById('editEstado').value = contrato.estadoContrato || '';
    document.getElementById('editSistema').value = contrato.sistema || '';
    document.getElementById('editNovedad').value = contrato.novedad || '';
    document.getElementById('editFecha').value = contrato.fechaNovedad ? contrato.fechaNovedad.split('T')[0] : '';

    modalEditar.style.display = 'flex';
}

// Cerrar modal
function cerrarModal() {
    modalEditar.style.display = 'none';
}

// Guardar seguimiento
async function guardarSeguimiento(event) {
    event.preventDefault();

    const id = document.getElementById('editContratoId').value;
    const data = {
        abogadoResponsable: document.getElementById('editAbogado').value.trim() || null,
        estadoContrato: document.getElementById('editEstado').value || null,
        sistema: document.getElementById('editSistema').value.trim() || null,
        novedad: document.getElementById('editNovedad').value.trim() || null,
        fechaNovedad: document.getElementById('editFecha').value || null
    };

    console.log('💾 Guardando seguimiento:', data);

    try {
        const response = await fetch(`${API_URL}/api/seguimiento/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.ok) {
            alert('✅ Seguimiento actualizado correctamente');
            cerrarModal();
            cargarSeguimiento(); // Recargar tabla
        } else {
            alert('❌ Error al guardar: ' + (result.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('❌ Error guardando:', error);
        alert('❌ Error de conexión con el servidor');
    }
}

// Exportar a Excel (función placeholder)
function exportarExcel() {
    alert('📥 Funcionalidad de exportación a Excel en desarrollo.\n\nPor ahora puedes copiar la tabla manualmente.');
    // TODO: Implementar exportación con SheetJS o similar
}

// UTILIDADES DE FORMATO

function formatearVinculados(vinculados) {
    if (!vinculados || (!vinculados.vigenciaDesde && !vinculados.vigenciaHasta)) {
        return '-';
    }
    const desde = formatearFecha(vinculados.vigenciaDesde);
    const hasta = formatearFecha(vinculados.vigenciaHasta);
    return `${desde}\n${hasta}`;
}

function formatearVigencia(principal) {
    if (!principal || (!principal.fechaInicio && !principal.fechaTerminacion)) {
        return '-';
    }
    const inicio = formatearFecha(principal.fechaInicio);
    const fin = formatearFecha(principal.fechaTerminacion);
    return `${inicio}\n${fin}`;
}

function formatearEstado(estado) {
    if (!estado) return '-';
    
    let clase = 'badge-default';
    if (estado === 'Ejecución') clase = 'badge-ejecucion';
    else if (estado === 'Terminado') clase = 'badge-terminado';
    else if (estado === 'Suspendido') clase = 'badge-suspendido';
    
    return `<span class="badge-estado ${clase}">${estado}</span>`;
}

function formatearFecha(fecha) {
    if (!fecha) return '-';
    try {
        return new Date(fecha).toLocaleDateString('es-CO', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch (e) {
        return '-';
    }
}

function formatearMoneda(valor) {
    if (!valor || valor === 0) return '-';
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(valor);
    } catch (e) {
        return '-';
    }
}

function mostrarLoading() {
    loadingSpinner.style.display = 'flex';
    tableContainer.style.display = 'none';
    noResults.style.display = 'none';
}

function ocultarLoading() {
    loadingSpinner.style.display = 'none';
}

function mostrarError() {
    ocultarLoading();
    noResults.style.display = 'block';
    tableContainer.style.display = 'none';
}