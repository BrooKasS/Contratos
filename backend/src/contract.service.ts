// src/contract.service.ts

import { extraerCRP } from "./etl/sections/crp.parser";
import { extraerPolizas } from "./etl/sections/polizas.parser";
import { extraerOtrosi } from "./etl/sections/otrosi.parser";
import { extraerContratoPrincipal } from "./etl/sections/principal.parser";
import { extraerPagoActual } from "./etl/sections/pagoAct.parser";
import { extraerGeneralidades } from "./etl/sections/generalidades.parser";

export function extraerContratoCompleto(
  buffer: Buffer,
  fileName: string
) {
  return {
    generalidades: extraerGeneralidades(buffer, fileName),
    principal: extraerContratoPrincipal(buffer, fileName),
   crp: extraerCRP(buffer, fileName),
    polizas: extraerPolizas(buffer, fileName),
    otrosies: extraerOtrosi(buffer, fileName),
    pagos: extraerPagoActual(buffer, fileName),
    createdAt: new Date()
  };
}
