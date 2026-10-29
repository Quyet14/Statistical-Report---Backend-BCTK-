import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  async sendOtpEmail(to: string, otp: string): Promise<void> {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || 'no-reply@bctk.local';
    const secure = process.env.SMTP_SECURE === 'true' || Number(port) === 465;

    if (process.env.OTP_ENABLED === 'false' || !host || !user || !pass) {
      throw new ServiceUnavailableException(
        'OTP email delivery is unavailable',
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: {
        user,
        pass,
      },
    });

    await transporter.sendMail({
      from,
      to,
      subject: 'Mã OTP đăng nhập BCTK',
      text: `Mã OTP của bạn là: ${otp}. Mã này có hiệu lực trong 5 phút.`,
      html: `<p>Mã OTP của bạn là: <strong>${otp}</strong></p><p>Mã này có hiệu lực trong 5 phút.</p>`,
    });
  }
}
