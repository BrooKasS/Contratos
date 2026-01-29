// ===================== CONFIG =====================
const API_URL = "http://localhost:3000/api/upload/contrato";

// ===================== STATE ======================
let contratoData = null;
let activeTab = null;

// 🔹 NUEVO: lista global de contratos cargados
let contratosSeguimiento = [];

// ===================== COLUMN DEFINITIONS =========
const COLUMNS = {
  crp: [
    { label: "Fecha", key: "fecha" },
    { label: "Número", key: "numero" },
    { label: "Código", key: "codigo" },
    { label: "Rubro", key: "rubro" },
    { label: "Valor", key: "valor" }
  ],

  polizas: [
    { label: "Aseguradora", key: "aseguradora" },
    { label: "N° Póliza", key: "numeroPoliza" },
    { label: "Amparo", key: "amparo" },
    { label: "Inicio Vigencia", key: "vigenciaInicio" },
    { label: "Fin Vigencia", key: "vigenciaFin" },
    { label: "Valor Asegurado", key: "valorAsegurado" }
  ],

  otrosies: [
    { label: "N°", key: "numero" },
    { label: "Tipo", key: "tipo" },
    { label: "Fecha Inicio", key: "fechaInicio" },
    { label: "Fecha Fin", key: "fechaFin" },
    { label: "Valor Adición", key: "valorAdicion" }
  ],

  pagos: [
    { label: "N°", key: "numero" },
    { label: "Fecha", key: "fecha" },
    { label: "Factura", key: "numeroFactura" },
    { label: "Concepto", key: "concepto" },
    { label: "Valor", key: "valor" }
  ]
};

// ===================== EVENTS =====================
document.getElementById("uploadBtn").addEventListener("click", uploadFile);

document.getElementById("tabs").addEventListener("click", (e) => {
  if (!e.target.dataset.tab) return;
  activeTab = e.target.dataset.tab;
  renderTab(activeTab);
});

// 🔹 NUEVO: filtros
document.getElementById("filtroProveedor")?.addEventListener("change", renderSeguimiento);
document.getElementById("filtroNumero")?.addEventListener("input", renderSeguimiento);

// ===================== HELPERS =====================

// 🔹 NUEVO: obtiene resumen sin romper si cambia backend
function getResumenSeguro(data) {
  if (data.resumen) return data.resumen;

  if (data.contrato?.generalidades?.generalidades) {
    const g = data.contrato.generalidades.generalidades;
    return {
      contratista: g.contratista || g.nombreContratista || "",
      numeroContrato: g.numeroContrato || "",
      tipoContrato: g.tipoContrato || "",
      fechaInforme: g.fechaInforme || ""
    };
  }

  return null;
}

// ===================== UPLOAD =====================
async function uploadFile() {
  const fileInput = document.getElementById("fileInput");
  const status = document.getElementById("status");

  if (!fileInput.files.length) {
    status.textContent = "❌ Selecciona un archivo";
    return;
  }

  status.textContent = "⏳ Procesando archivo...";
  status.className = "loading";

  const formData = new FormData();
  formData.append("informe", fileInput.files[0]);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!data.ok) throw new Error(data.error || "Error desconocido");

    contratoData = data.contrato;

    // 🔹 NUEVO: resumen seguro
    const resumenSeguro = getResumenSeguro(data);
    if (!resumenSeguro) throw new Error("No se pudo obtener resumen del contrato");

    // 🔹 NUEVO: validar duplicado
    if (contratosSeguimiento.some(c => c.numeroContrato === resumenSeguro.numeroContrato)) {
      throw new Error("⚠️ El contrato ya fue cargado");
    }

    // 🔹 NUEVO: agregar a seguimiento
    const pagos = contratoData.pagos?.resumen || {};
    contratosSeguimiento.push({
      numeroContrato: resumenSeguro.numeroContrato,
      proveedor: resumenSeguro.contratista,
      valor: pagos.valorTotalContrato || 0,
      pagado: pagos.valorPagadoAntes || 0,
      saldo: pagos.saldoDelContrato || 0
    });

    renderResumen(resumenSeguro);
    actualizarFiltrosProveedor();
    renderSeguimiento();

    document.getElementById("seguimiento").classList.remove("hidden");
    document.getElementById("tabs").classList.remove("hidden");
    document.getElementById("contenido").innerHTML = "";

    status.textContent = "✅ Archivo procesado correctamente";
    status.className = "";

  } catch (err) {
    status.textContent = err.message;
    status.className = "error";
  }
}

// ===================== RESUMEN =====================
function renderResumen(resumen) {
  document.getElementById("resumen").innerHTML = `
    <h3>📌 Resumen del contrato</h3>
    <p><b>Contratista:</b> ${resumen.contratista}</p>
    <p><b>N° Contrato:</b> ${resumen.numeroContrato}</p>
    <p><b>Tipo:</b> ${resumen.tipoContrato}</p>
    <p><b>Fecha informe:</b> ${resumen.fechaInforme}</p>
  `;
}

// ===================== SEGUIMIENTO =====================

// 🔹 NUEVO
function actualizarFiltrosProveedor() {
  const select = document.getElementById("filtroProveedor");
  if (!select) return;

  select.innerHTML = `<option value="">Todos</option>`;
  [...new Set(contratosSeguimiento.map(c => c.proveedor))]
    .forEach(p => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      select.appendChild(opt);
    });
}

// 🔹 NUEVO
function renderSeguimiento() {
  const tbody = document.getElementById("tablaSeguimiento");
  if (!tbody) return;

  const proveedor = document.getElementById("filtroProveedor")?.value || "";
  const numero = document.getElementById("filtroNumero")?.value.toLowerCase() || "";

  tbody.innerHTML = "";

  contratosSeguimiento
    .filter(c =>
      (!proveedor || c.proveedor === proveedor) &&
      (!numero || c.numeroContrato.toLowerCase().includes(numero))
    )
    .forEach(c => {
      const ejec = c.valor ? ((c.pagado / c.valor) * 100).toFixed(1) : "0";
      tbody.innerHTML += `
        <tr>
          <td>${c.numeroContrato}</td>
          <td>${c.proveedor}</td>
          <td>$${c.valor.toLocaleString()}</td>
          <td>$${c.pagado.toLocaleString()}</td>
          <td>$${c.saldo.toLocaleString()}</td>
          <td>${ejec}%</td>
        </tr>
      `;
    });
}

// ===================== TAB RENDER =================
function renderTab(tab) {
  if (!contratoData) return;

  const container = document.getElementById("contenido");

  switch (tab) {
    case "generalidades":
      renderGeneralidades(container);
      break;
    case "principal":
      renderPrincipal(container);
      break;
    case "crp":
      renderCRP(container);
      break;
    case "polizas":
      renderPolizas(container);
      break;
    case "otrosies":
      renderOtrosies(container);
      break;
    case "pagos":
      renderPagos(container);
      break;
  }
}

// ===================== SECTIONS ===================
function renderGeneralidades(container) {
  const g = contratoData.generalidades.generalidades;

  container.innerHTML = `
    <h3>Generalidades</h3>
    <p><b>Supervisor:</b> ${g.nombreSupervisor}</p>
    <p><b>Dependencia:</b> ${g.dependencia}</p>
    <p><b>Objeto:</b> ${g.objetoContrato}</p>
  `;
}

function renderPrincipal(container) {
  const c = contratoData.principal.contrato;

  container.innerHTML = `
    <h3>Contrato principal</h3>
    <p><b>Fecha inicio:</b> ${c.fechaInicio}</p>
    <p><b>Fecha terminación:</b> ${c.fechaTerminacion}</p>
    <p><b>Duración:</b> ${c.duracion}</p>
    <p><b>Valor:</b> $${c.valor.toLocaleString()}</p>
  `;
}

function renderCRP(container) {
  container.innerHTML = `
    <h3>CRP</h3>
    ${renderTable(COLUMNS.crp, contratoData.crp.crp)}
    <p><b>Total CRP:</b> $${contratoData.crp.totalCRP.toLocaleString()}</p>
  `;
}

function renderPolizas(container) {
  container.innerHTML = `
    <h3>Pólizas</h3>
    ${renderTable(COLUMNS.polizas, contratoData.polizas.polizas)}
    <p><b>Total asegurado:</b> $${contratoData.polizas.totalValorAsegurado.toLocaleString()}</p>
  `;
}

function renderOtrosies(container) {
  container.innerHTML = `
    <h3>Otrosíes</h3>
    ${renderTable(COLUMNS.otrosies, contratoData.otrosies.otrosies)}
  `;
}

function renderPagos(container) {
  const r = contratoData.pagos.resumen;

  container.innerHTML = `
    <h3>Pagos</h3>
    ${renderTable(COLUMNS.pagos, contratoData.pagos.pagos)}

    <h4>Resumen financiero</h4>
    <ul>
      <li>Total contrato: $${r.valorTotalContrato.toLocaleString()}</li>
      <li>Pagado antes: $${r.valorPagadoAntes.toLocaleString()}</li>
      <li>Pago actual: $${r.valorAPagarEnEsteInforme.toLocaleString()}</li>
      <li>Saldo contrato: $${r.saldoDelContrato.toLocaleString()}</li>
      <li>Saldo a liberar: $${r.saldoALiberar.toLocaleString()}</li>
    </ul>
  `;
}

// ===================== TABLE ======================
function renderTable(columns, rows) {
  let html = "<table><thead><tr>";

  columns.forEach(col => {
    html += `<th>${col.label}</th>`;
  });

  html += "</tr></thead><tbody>";

  rows.forEach(row => {
    html += "<tr>";
    columns.forEach(col => {
      let value = row[col.key];
      if (typeof value === "number") value = value.toLocaleString();
      html += `<td>${value ?? ""}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  
  return html;
}
