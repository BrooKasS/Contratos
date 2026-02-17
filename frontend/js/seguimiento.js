const API_URL = 'http://localhost:3000';
const loadingSpinner = document.getElementById('loadingSpinner');
const tableContainer = document.getElementById('tableContainer');
const tableBody = document.getElementById('tableBody');
const noResults = document.getElementById('noResults');
const btnRecargar = document.getElementById('btnRecargar');
const btnExportar = document.getElementById('btnExportar');
const modalEditar = document.getElementById('modalEditar');


let contratosData= [];

document.addEventListener('DOMContentLoaded', cargarSeguimiento);

// Eventos
btnRecargar.addEventListener('click', cargarSeguimiento);

btnExportar.addEventListener('click', exportarExcel);

// Cargar seguimiento desde la API
async function cargarSeguimiento() {
    mostrarLoading();

    try {
        const response = await fetch(`${API_URL}/api/seguimiento`);
        const data = await response.json();

        console.log('✅ Datos de seguimiento:', data);

        if (data.ok && data.contratos) {
            contratosData = data.contratos;
            mostrarTabla(data.contratos);
        } else {
            mostrarError();
        }
    } catch (error) {
        console.error('❌ Error cargando seguimiento:', error);
        mostrarError();
    }
}

// Mostrar tabla con todos los contratos
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