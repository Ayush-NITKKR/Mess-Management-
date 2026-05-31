const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
})

const createMailer = async (email, title, text, body) => {
  try {
    const fromAddress = process.env.MAIL_FROM
    if (!fromAddress || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
      throw new Error('Mail not configured. Set MAIL_USER, MAIL_PASS, and MAIL_FROM (optional).')
    }

    console.log(fromAddress);
    

    const info = await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: title,
      text,
      html: body,
    })

    console.log('Mail sent:', info)
    return info
  } catch (error) {
    console.error('Mail Error:', error)
    throw error
  }
}

module.exports = createMailer