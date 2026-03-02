// backend/src/email.service.ts
import "dotenv/config";
import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function enviarAlertaContrato(destino: string, contrato: any) {
  const fechaFin = contrato?.principal?.contrato?.fechaTerminacion;

  await transporter.sendMail({
    from: `Sistema de Contratos <${process.env.EMAIL_USER}>`,
    to: destino,
    subject: "⚠ Contrato próximo a vencer",
    html: `
      <h2>Alerta de Vencimiento</h2>
      <p><b>Contrato:</b> ${contrato?.numeroContrato ?? ""}</p>
      <p><b>Proveedor:</b> ${contrato?.proveedor ?? ""}</p>
      <p><b>Fecha de Terminación:</b> ${fechaFin ?? ""}</p>
      <p>Faltan 20 días para su finalización.</p>
    `,
  });
}