// Переопределения настроек для development с поддержкой email
const overrides = {}

// Добавляем email конфигурацию из переменных окружения
if (process.env.OVERLEAF_EMAIL_FROM_ADDRESS) {
  overrides.email = {
    fromAddress: process.env.OVERLEAF_EMAIL_FROM_ADDRESS,
    replyTo: process.env.OVERLEAF_EMAIL_REPLY_TO || '',
    driver: process.env.OVERLEAF_EMAIL_DRIVER,
    parameters: {
      host: process.env.OVERLEAF_EMAIL_SMTP_HOST,
      port: parseInt(process.env.OVERLEAF_EMAIL_SMTP_PORT || '25', 10),
      secure: process.env.OVERLEAF_EMAIL_SMTP_SECURE === 'true',
      ignoreTLS: process.env.OVERLEAF_EMAIL_SMTP_IGNORE_TLS === 'true',
      name: process.env.OVERLEAF_EMAIL_SMTP_NAME,
      logger: process.env.OVERLEAF_EMAIL_SMTP_LOGGER === 'true',
    },
  }

  if (process.env.OVERLEAF_EMAIL_SMTP_USER || process.env.OVERLEAF_EMAIL_SMTP_PASS) {
    overrides.email.parameters.auth = {
      user: process.env.OVERLEAF_EMAIL_SMTP_USER,
      pass: process.env.OVERLEAF_EMAIL_SMTP_PASS,
    }
  }
}

module.exports = overrides

