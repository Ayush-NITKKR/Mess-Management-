const nodemailer = require("nodemailer");
require("dotenv").config();

const createMailer = (normalizedEmail , title ,text, body) => {
try {
    const port = Number(process.env.MAIL_PORT || 587)
    let transporter =  nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  })
 let info = transporter.sendMail({
        from: `From Mess Management`,
        to: `${normalizedEmail}`,
        subject: title,
        text: text,
        html: body
      })
} catch (error) {
    
}
  
}
module.exports = createMailer;

