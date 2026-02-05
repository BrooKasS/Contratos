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
 * ID CONTRATO (DESDE HASH)
 **************************************************/
const contratoId = location.hash.startsWith('#id=')
    ? location.hash.replace('#id=', '')
    : null;

console.log('🔐 contratoId (HASH):', contratoId);

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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data?.ok || !data.contrato) {
            throw new Error('Respuesta inválida del backend');
        }

        mostrarContrato(data.contrato);

    } catch (err) {
        console.error(err);
        mostrarError(err.message || 'Error cargando contrato');
    }
}

/**************************************************
 * RENDER PRINCIPAL
 **************************************************/
function mostrarContrato(c) {
    ocultarLoading();
    contratoContent.style.display = 'block';

    setText('numeroContrato', c.numeroContrato);
    setText('tipoContrato', c.tipoContrato);
    setText('contratoId', c.id);
    setText('proveedor', c.proveedor);
    setText('fechaInforme', formatearFecha(c.fechaInforme));

    renderGeneralidades(c.generalidades);
    renderPrincipal(c.principal);
    renderSeguimiento(c); // 🔥 NUEVO
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

    for (const [k, v] of Object.entries({
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
 * CONTRATO PRINCIPAL
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
    ]
    .filter(([,v]) => v && v !== 'N/A')
    .map(([l,v]) => campo(l,v))
    .join('') || '<p class="muted">Sin datos</p>';
}

/**************************************************
 * 🔥 SEGUIMIENTO DE CONTRATO (CORE)
 **************************************************/
function renderSeguimiento(contrato) {
    const grid = document.getElementById('seguimientoGrid');
    if (!grid) return;

    const principal = contrato.principal?.contrato || {};
    const pagos = contrato.pagos?.pagos || [];

    const hoy = new Date();
    const inicio = principal.fechaInicio ? new Date(principal.fechaInicio) : null;
    const fin = principal.fechaTerminacion ? new Date(principal.fechaTerminacion) : null;

    const valorTotal = principal.valor || 0;
    const valorPagado = pagos.reduce((a,p)=>a+(p.valor||0),0);

    const pctFinanciero = valorTotal
        ? Math.round((valorPagado / valorTotal) * 100)
        : 0;

    let pctTiempo = 'N/A';
    let diasRestantes = 'N/A';
    let estado = 'N/A';

    if (inicio && fin) {
        const total = fin - inicio;
        const transcurrido = hoy - inicio;

        pctTiempo = Math.min(100, Math.max(0, Math.round((transcurrido / total) * 100)));
        diasRestantes = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));

        if (diasRestantes < 0) estado = 'VENCIDO';
        else if (diasRestantes <= 30) estado = 'PRÓXIMO A VENCER';
        else estado = 'VIGENTE';
    }

    grid.innerHTML = [
        ['Estado del contrato', estado],
        ['% Ejecución financiera', `${pctFinanciero}%`],
        ['% Ejecución en tiempo', pctTiempo === 'N/A' ? 'N/A' : `${pctTiempo}%`],
        ['Días restantes', diasRestantes]
    ].map(([l,v])=>campo(l,v)).join('');
}

/**************************************************
 * CRP
 **************************************************/
function renderCRP(data = {}) {
    const body = document.getElementById('crpTableBody');
    if (!body) return;

    const crps = data?.crp || [];
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
 * PAGOS
 **************************************************/
function renderPagos(data = {}) {
    const resumenDiv = document.getElementById('resumenPagos');
    const body = document.getElementById('pagosTableBody');
    if (!body || !resumenDiv) return;

    const pagos = data?.pagos || [];
    const r = data?.resumen;

    if (r) {
        resumenDiv.innerHTML = `
            <div><strong>💰 Total:</strong> ${formatearMoneda(r.valorTotalContrato)}</div>
            <div><strong>📥 Pagado:</strong> ${formatearMoneda(r.valorPagadoAntes)}</div>
            <div><strong>💵 Este informe:</strong> ${formatearMoneda(r.valorAPagarEnEsteInforme)}</div>
            <div><strong>📉 Saldo:</strong> ${formatearMoneda(r.saldoDelContrato)}</div>
        `;
    }

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
    loadingSpinner.style.display='flex';
    contratoContent.style.display='none';
    errorContainer.style.display='none';
}

function ocultarLoading(){
    loadingSpinner.style.display='none';
}

function mostrarError(msg){
    ocultarLoading();
    errorContainer.style.display='block';
    errorMessage.textContent = msg;
}
