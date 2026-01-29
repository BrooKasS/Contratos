import { extraerCRP } from "./sections/crp.parser";

export function procesarInforme(buffer: Buffer) {
  return {
    crp: extraerCRP(buffer)
  };
}
