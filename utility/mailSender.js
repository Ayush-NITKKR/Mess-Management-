const nodemailer = require("nodemailer");

const createMailer = async (email, title, text, body) => {
  try {
    const port = Number(process.env.MAIL_PORT || 587);

    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: email,
      subject: title,
      text,
      html: body,
    });

    console.log("Mail sent:", info.messageId);

    return info;
  } catch (error) {
    console.error("Mail Error:", error);
    throw error;
  }
};

module.exports = createMailer;