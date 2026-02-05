export type ContratoPrincipal = {
  fechaPerfeccionamiento: string;  
  duracion: string;
  fechaInicio: string;             
  actaInicio: boolean;            
  indeterminado: boolean;
  fechaTerminacion: string;
  valor: number;
};

export type ContratoPrincipalExtract = {
  hoja: string;
  seccion: "CONTRATO PRINCIPAL";
  contrato: ContratoPrincipal;
  fuente: { excel: string; hoja: string };
};

  export type Poliza = {
  aseguradora: string;
  numeroPoliza: string;
  amparo: string;
  vigenciaInicio: string; 
  vigenciaFin: string;    
  valorAsegurado: number;
};

export type PolizasExtract = {
  hoja: string;
  seccion: string;          
  columnas: string[];       
  polizas: Poliza[];
  totalValorAsegurado: number;
  fuente: { excel: string; hoja: string };
};

export type CRP = {
  fecha: string;
  numero: string;
  codigo: string;
  rubro: string;
  valor: number;
};

export type CRPExtract = {
  hoja: string;
  seccion: string;                  
  hastaAntesDe: string;            
  columnas: string[];               
  crp: CRP[];
  totalCRP: number;                 
  fuente: { excel: string; hoja: string };

};

export type Otrosi = {
  numero: number;
  fechaPerfeccionamiento: string;
  tipo: "ADICION" | "PRORROGA" | "MODIFICACION" | "";
  duracionProrroga: string;
  fechaInicio: string;
  fechaFin: string;
  valorAdicion: number;
};

export type OtrosiExtract = {
  hoja: string;
  seccion: string;
  columnas: string[];
  otrosies: Otrosi[];
  fuente: { excel: string; hoja: string };
};


export type PagoActual = {
  numero: number,
  fecha: string;
  numeroFactura: string;
  numeroCRP: string;
  numeroPedido: string;
  numeroCDP: string;
  numeroSolicitud: string;
  concepto: string;
  valor: number;
};

export type PagoActualExtract = {
  hoja: string;
  seccion: string;
  columnas: string[];
  pagos: PagoActual[];
  resumen: {
    valorTotalContrato: number;
    valorPagadoAntes: number;
    valorAPagarEnEsteInforme: number;
    saldoDelContrato: number;
    saldoALiberar: number;
  };
  fuente: { excel: string; hoja: string };
} 


export type Generalidades = {
  nombreSupervisor: string;
  dependencia: string;
  numeroContrato: string;
  tipoContrato: string;
  contratista: string;
  nit: string;
  cedulaCiudadania: string;
  representanteLegal: string;
  cedulaRepresentante: string;
  objetoContrato: string;
  certificacionUnidadVinculados: {
    vigenciaDesde: string; 
    vigenciaHasta: string; 
  };
  fechaInforme: string; 
};

export type GeneralidadesExtract = {
  hoja: string;
  seccion: string;
  generalidades: Generalidades;
  fuente: { excel: string; hoja: string };
};  




