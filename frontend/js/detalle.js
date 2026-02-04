/**************************************************
 * DEBUG
 **************************************************/
console.log('🌍 URL:', location.href);

/**************************************************
 * CONFIG
 **************************************************/
const API_URL = 'http://localhost:3000';

/**************************************************
 * DOM
 **************************************************/
const loadingSpinner  = document.getElementById('loadingSpinner');
const errorContainer  = document.getElementById('errorContainer');
const errorMessage    = document.getElementById('errorMessage');
const contratoContent = document.getElementById('contratoContent');

/**************************************************
 * ID CONTRATO
 **************************************************/
const contratoId = localStorage.getItem('contratoId');
console.log('🔐 contratoId:', contratoId);

if (!contratoId) {
    mostrarError('No se especificó un ID de contrato');
} else {
    cargarContrato(contratoId);
}

/**************************************************
 * FETCH
 **************************************************/
async function cargarContrato(id) {
    mostrarLoading();
    try {
        const res = await fetch(`${API_URL}/api/contratos/${id}`);
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await res.json();
        if (!data.ok || !data.contrato) throw new Error('Contrato inválido');

        console.log('📦 Contrato recibido:', data.contrato);

        mostrarContrato(data.contrato);
        localStorage.removeItem('contratoId');
    } catch (e) {
        mostrarError(e.message);
    }
}

/**************************************************
 * RENDER PRINCIPAL
 **************************************************/
function mostrarContrato(c) {
    ocultarLoading();
    if (contratoContent) contratoContent.style.display = 'block';

    setText('numeroContrato', c.numeroContrato);
    setText('tipoContrato', c.tipoContrato);
    setText('contratoId', c.id);
    setText('proveedor', c.proveedor);
    setText('fechaInforme', formatearFecha(c.fechaInforme));

    renderGeneralidades(c.generalidades);
    renderPrincipal(c.principal);
    renderCRP(c.crp);
    renderPolizas(c.polizas);

    renderOtrosies(c.otrosies);
    renderPagos(c.pagos);

    activarTabs();
}

/**************************************************
 * GENERALIDADES
 **************************************************/
function renderGeneralidades(data = {}) {
    const grid = document.getElementById('generalidadesGrid');
    if (!grid) return;

    const g = data.generalidades || {};
    let html = '';

    for (const [k,v] of Object.entries({
        'NIT': g.nit,
        'Contratista': g.contratista,
        'Dependencia': g.dependencia,
        'Número Contrato': g.numeroContrato,
        'Tipo Contrato': g.tipoContrato,
        'Supervisor': g.nombreSupervisor
    })) {
        if (v) html += campo(k, v);
    }

    if (g.objetoContrato) {
        html += `
        <div class="info-field" style="grid-column:1/-1">
            <span class="field-label">Objeto del Contrato</span>
            <span class="field-value">${g.objetoContrato}</span>
        </div>`;
    }

    grid.innerHTML = html || '<p class="muted">Sin datos</p>';
}

/**************************************************
 * PRINCIPAL
 **************************************************/
function renderPrincipal(data = {}) {
    const grid = document.getElementById('principalGrid');
    if (!grid) return;

    const c = data.contrato || {};
    grid.innerHTML = [
        ['Valor', formatearMoneda(c.valor)],
        ['Duración', c.duracion],
        ['Inicio', formatearFecha(c.fechaInicio)],
        ['Fin', formatearFecha(c.fechaTerminacion)]
    ].filter(([,v]) => v && v !== 'N/A')
     .map(([l,v]) => campo(l,v))
     .join('') || '<p class="muted">Sin datos</p>';
}

/**************************************************
 * CRP
 **************************************************/
function renderCRP(data = {}) {
    const body = document.getElementById('crpTableBody');
    if (!body) return;

    const crps = data?.crp || [];
    console.log('🔹 CRP recibidos:', crps);

    if (!crps.length) {
        body.innerHTML = filaVacia(6,'Sin CRP');
        return;
    }

    body.innerHTML = crps.map((c,i)=>`
        <tr>
            <td>${i+1}</td>
            <td>${formatearFecha(c.fecha)}</td>
            <td>${c.numero || '—'}</td>
            <td>${c.codigo || '—'}</td>
            <td>${c.rubro || '—'}</td>
            <td>${formatearMoneda(c.valor)}</td>
        </tr>
    `).join('');
}

/**************************************************
 * POLIZAS
 **************************************************/
function renderPolizas(data = {}) {
    const body = document.getElementById('polizasTableBody');
    if (!body) return;

    const polizas = data?.polizas || [];
    console.log('🔹 Pólizas recibidas:', polizas);

    if (!polizas.length) {
        body.innerHTML = filaVacia(7,'Sin pólizas');
        return;
    }

    body.innerHTML = polizas.map((p,i)=>`
        <tr>
            <td>${i+1}</td>
            <td>${p.aseguradora || '—'}</td>
            <td>${p.numeroPoliza || '—'}</td>
            <td>${p.amparo || '—'}</td>
            <td>${formatearFecha(p.vigenciaInicio)}</td>
            <td>${formatearFecha(p.vigenciaFin)}</td>
            <td>${formatearMoneda(p.valorAsegurado)}</td>
        </tr>
    `).join('');
}

/**************************************************
 * OTROSIES
 **************************************************/
function renderOtrosies(data = {}) {
    const body = document.getElementById('otrosiesTableBody');
    if (!body) return;

    const otros = data?.otrosies || [];
    console.log('🔹 Otrosíes recibidos:', otros);

    if (!otros.length) {
        body.innerHTML = filaVacia(7,'Sin otrosíes');
        return;
    }

    body.innerHTML = otros.map((o,i)=>`
        <tr>
            <td>${i+1}</td>
            <td>${o.tipo || '—'}</td>
            <td>${o.numero || '—'}</td>
            <td>${formatearFecha(o.fechaInicio)}</td>
            <td>${formatearFecha(o.fechaFin)}</td>
            <td>${o.duracionProrroga || '—'}</td>
            <td>${formatearMoneda(o.valorAdicion)}</td>
        </tr>
    `).join('');
}

/**************************************************
 * PAGOS (Con RESUMEN)
 **************************************************/
function renderPagos(data = {}) {
    const resumenDiv = document.getElementById('resumenPagos');
    const body = document.getElementById('pagosTableBody');
    if (!body || !resumenDiv) return;

    const pagos = data?.pagos || [];
    const r = data?.resumen || null;

    console.log('🔹 Pagos recibidos:', pagos);
    console.log('📊 Resumen pagos:', r);

    // RENDER RESUMEN
    if (r) {
        resumenDiv.innerHTML = `
            <div class="resumen-item"><strong>💰 Valor Total Contrato:</strong> ${formatearMoneda(r.valorTotalContrato)}</div>
            <div class="resumen-item"><strong>📥 Valor Pagado Antes:</strong> ${formatearMoneda(r.valorPagadoAntes)}</div>
            <div class="resumen-item"><strong>💵 Valor a Pagar en Este Informe:</strong> ${formatearMoneda(r.valorAPagarEnEsteInforme)}</div>
            <div class="resumen-item"><strong>📉 Saldo del Contrato:</strong> ${formatearMoneda(r.saldoDelContrato)}</div>
            <div class="resumen-item"><strong>🔓 Saldo a Liberar:</strong> ${formatearMoneda(r.saldoALiberar)}</div>
        `;
    } else {
        resumenDiv.innerHTML = '<p class="muted">No hay resumen de pagos disponible.</p>';
    }

    // RENDER TABLA PAGOS
    if (!pagos.length) {
        body.innerHTML = filaVacia(9,'Sin pagos');
        return;
    }

    body.innerHTML = pagos.map((p,i)=>`
        <tr>
            <td>${i+1}</td>
            <td>${formatearFecha(p.fecha)}</td>
            <td>${p.numeroFactura || '—'}</td>
            <td>${p.numeroCRP || '—'}</td>
            <td>${p.numeroPedido || '—'}</td>
            <td>${p.numeroCDP || '—'}</td>
            <td>${p.numeroSolicitud || '—'}</td>
            <td>${p.concepto || '—'}</td>
            <td>${formatearMoneda(p.valor)}</td>
        </tr>
    `).join('');
}

/**************************************************
 * HELPERS
 **************************************************/
function setText(id,val){
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? 'N/A';
}

const campo = (l,v)=>`
<div class="info-field">
    <span class="field-label">${l}</span>
    <span class="field-value">${v}</span>
</div>`;

const filaVacia = (n,msg)=>`<tr><td colspan="${n}">${msg}</td></tr>`;

function activarTabs(){
    document.querySelectorAll('.tab').forEach(t=>{
        t.onclick=()=>{
            document.querySelectorAll('.tab,.tab-content')
            .forEach(e=>e.classList.remove('active'));
            t.classList.add('active');
            document.getElementById(t.dataset.tab)?.classList.add('active');
        };
    });
}

function formatearFecha(f){
    if(!f) return 'N/A';
    return new Date(f).toLocaleDateString('es-CO');
}

function formatearMoneda(v){
    if(v==null) return 'N/A';
    return new Intl.NumberFormat('es-CO',{
        style:'currency',
        currency:'COP',
        maximumFractionDigits:0
    }).format(v);
}

function mostrarLoading(){
    loadingSpinner && (loadingSpinner.style.display='flex');
    contratoContent && (contratoContent.style.display='none');
    errorContainer && (errorContainer.style.display='none');
}

function ocultarLoading(){
    loadingSpinner && (loadingSpinner.style.display='none');
}

function mostrarError(msg){
    ocultarLoading();
    if (errorContainer) errorContainer.style.display='block';
    if (errorMessage) errorMessage.textContent=msg;
}
