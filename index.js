global.punycode = require('punycode');

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Definimos un estado especial para "modo humano"
const HUMAN_MODE = 999;

// Objeto para manejar el estado de conversación de cada usuario
const conversationState = {};

/**
 * Determina si estamos dentro del horario de atención:
 * Lunes (1) a Viernes (5), de 09:00 a 18:00 (hora local).
 */
function isWithinBusinessHours() {
  const now = new Date();
  const day = now.getDay();    // 0: Domingo, 1: Lunes, ..., 6: Sábado
  const hour = now.getHours(); // 0 - 23

  const isWeekday = (day >= 1 && day <= 5);
  const isWorkingHours = (hour >= 9 && hour < 18);

  return isWeekday && isWorkingHours;
}

// Inicializamos el cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './session'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        browserWSEndpoint: null
    },
    webVersionCache: {
        type: 'none'
    }
});

// Mostrar el QR en consola
client.on('qr', (qr) => {
  console.log('Escanea el código QR para iniciar sesión:');
  qrcode.generate(qr, { small: true });
});

// Cuando el cliente está listo
client.on('ready', () => {
  console.log('¡El cliente de WhatsApp está listo!');
});

/**
 * Envía el menú principal (mensaje simple, no reply).
 */
async function enviarMenu(message) {
  const menuText =
    `¡Hola! Bienvenido(a) a Inted.\n` +
    `Por favor, elige una de las siguientes opciones (escribe el número):\n\n` +
    `1) Licitaciones\n` +
    `2) Proyectos Constructivos\n` +
    `3) Hablar con un representante\n\n` +
    `Si en cualquier momento deseas volver al menú, escribe "menu".`;

  const chat = await message.getChat();
  await chat.sendMessage(menuText);
}

/**
 * Manejo de estados:
 * - Licitaciones: steps 10,11,12
 * - Proyectos: steps 20,21,22
 * - Representante: steps 40,41,42  (SIEMPRE captura datos, sea dentro o fuera de horario)
 * - HUMAN_MODE = 999 => el bot no responde más
 */
client.on('message', async (message) => {
  // Ignorar mensajes que vienen del propio número del bot
  if (message.fromMe) {
    console.log('Mensaje propio (fromMe). Se ignora para no interrumpir la conversación humana.');
    return;
  }

  const chatId = message.from;
  const originalText = message.body;
  const text = originalText.toLowerCase().trim();

  console.log(`\n[${new Date().toLocaleString()}] Mensaje de ${chatId}: "${originalText}"`);

  // Aseguramos un estado inicial
  if (!conversationState[chatId]) {
    conversationState[chatId] = { step: 0, topic: null };
  }
  const userState = conversationState[chatId];

  // Si el usuario está en modo humano, el bot NO responde más
  if (userState.step === HUMAN_MODE) {
    console.log('El usuario ya está en modo humano. El bot no responde.');
    return;
  }

  // Obtenemos el chat (para enviar mensajes simples en lugar de "reply")
  const chat = await message.getChat();

  // --- Flujos de captura (licitaciones: steps 10..12, proyectos: 20..22, representante: 40..42) ---

  // LICITACIONES: step 10 (nombre), 11 (email), 12 (consulta)
  if (userState.step === 10) {
    userState.nombre = originalText.trim();
    userState.step = 11;
    await chat.sendMessage('Gracias. Ahora, ¿podrías compartir tu dirección de email?');
    return;
  }
  if (userState.step === 11) {
    userState.email = originalText.trim();
    userState.step = 12;
    await chat.sendMessage('Por favor, cuéntanos tu consulta completa:');
    return;
  }
  if (userState.step === 12) {
    userState.consulta = originalText.trim();
    userState.step = HUMAN_MODE; // Terminamos, enviamos confirmación y pasamos a modo HUMANO

    await chat.sendMessage(
      `¡Perfecto, ${userState.nombre}! Hemos recibido tu consulta:\n\n` +
      `"${userState.consulta}"\n\n` +
      `Te contactaremos pronto. Gracias por comunicarte con Inted.`
    );
    console.log(`El usuario ${chatId} ha pasado a HUMAN_MODE tras Licitaciones.`);
    return;
  }

  // PROYECTOS: step 20 (nombre), 21 (email), 22 (consulta)
  if (userState.step === 20) {
    userState.nombre = originalText.trim();
    userState.step = 21;
    await chat.sendMessage('Gracias. ¿Podrías compartir tu dirección de email?');
    return;
  }
  if (userState.step === 21) {
    userState.email = originalText.trim();
    userState.step = 22;
    await chat.sendMessage('Por favor, cuéntanos tu consulta completa:');
    return;
  }
  if (userState.step === 22) {
    userState.consulta = originalText.trim();
    userState.step = HUMAN_MODE;

    await chat.sendMessage(
      `¡Perfecto, ${userState.nombre}! Hemos recibido tu consulta:\n\n` +
      `"${userState.consulta}"\n\n` +
      `Te contactaremos pronto. Gracias por comunicarte con Inted.`
    );
    console.log(`El usuario ${chatId} ha pasado a HUMAN_MODE tras Proyectos.`);
    return;
  }

  // REPRESENTANTE: steps 40 (nombre), 41 (email), 42 (detalle)
  if (userState.step === 40) {
    userState.nombre = originalText.trim();
    userState.step = 41;
    await chat.sendMessage('Gracias. ¿Podrías compartir tu dirección de email?');
    return;
  }
  if (userState.step === 41) {
    userState.email = originalText.trim();
    userState.step = 42;
    await chat.sendMessage('Por favor, cuéntanos brevemente tu motivo de consulta:');
    return;
  }
  if (userState.step === 42) {
    userState.consulta = originalText.trim();
    userState.step = HUMAN_MODE;

    // Si quieres, puedes mostrar un mensaje distinto según si es horario laboral o no
    if (isWithinBusinessHours()) {
      // Dentro de horario, el representante está disponible
      await chat.sendMessage(
        `¡Perfecto, ${userState.nombre}!\n` +
        `Hemos recibido tu información: "${userState.consulta}"\n\n` +
        `En breve, un representante humano continuará la conversación contigo.`
      );
    } else {
      // Fuera de horario
      await chat.sendMessage(
        `¡Perfecto, ${userState.nombre}!\n` +
        `Hemos recibido tu información: "${userState.consulta}"\n\n` +
        `En cuanto estemos en horario, un representante se comunicará contigo.`
      );
    }
    console.log(`El usuario ${chatId} ha pasado a HUMAN_MODE tras Representante.`);
    return;
  }

  // --- MENÚ PRINCIPAL O SELECCIÓN DE OPCIONES ---
  // Si escribe "hola", "menu", etc.
  if (
    text.includes('hola') ||
    text.includes('buenas') ||
    text.includes('menu') ||
    text.includes('menú')
  ) {
    await enviarMenu(message);
    return;
  }

  // Opción 1: Licitaciones
  if (text === '1' || text.includes('licitacion')) {
    await chat.sendMessage(
      `*Consultoría en Licitaciones Públicas y/o Privadas*\n` +
      `Brindamos asesoramiento en todas las etapas: desde la documentación licitatoria hasta la ejecución del proyecto adjudicado.\n\n` +
      `Para más información: https://inted-web.vercel.app/consultoria-licitaciones\n\n` +
      `¿Te gustaría hablar con un representante? Escribe "SI" o "NO".`
    );
    userState.topic = 'licitaciones';
    return;
  }

  // Opción 2: Proyectos Constructivos
  if (text === '2' || text.includes('proyecto') || text.includes('constructivo')) {
    await chat.sendMessage(
      `*Consultoría en Desarrollo de Proyectos Constructivos*\n` +
      `Nuestro asesoramiento integral en la gestoría de trámites requeridos para la realización de proyectos constructivos.\n\n` +
      `Para más información: https://inted-web.vercel.app/proyectos-constructivos\n\n` +
      `¿Te gustaría hablar con un representante? Escribe "SI" o "NO".`
    );
    userState.topic = 'proyectos';
    return;
  }

  // Opción 3: Hablar con un representante
  if (text === '3' || text.includes('representante') || text.includes('hablar con')) {
    // Anunciamos si es dentro/fuera de horario (opcional)
    if (isWithinBusinessHours()) {
      await chat.sendMessage(`Estamos *dentro* de nuestro horario de atención (Lunes a Viernes, 09:00 a 18:00).`);
    } else {
      await chat.sendMessage(`Estamos *fuera* de nuestro horario de atención (Lunes a Viernes, 09:00 a 18:00).`);
    }

    // Iniciamos el flujo de steps 40..42
    userState.step = 40;
    await chat.sendMessage('Por favor, indícanos tu nombre completo:');
    console.log(`El usuario ${chatId} comienza a dejar datos para hablar con un representante.`);
    return;
  }

  // Manejo de "SI" / "NO" tras Licitaciones o Proyectos
  if (text === 'si' || text === 'sí') {
    if (userState.topic === 'licitaciones') {
      userState.step = 10;
      await chat.sendMessage('¡Excelente! Primero, ¿podrías indicar tu nombre completo?');
      return;
    }
    if (userState.topic === 'proyectos') {
      userState.step = 20;
      await chat.sendMessage('¡Excelente! Primero, ¿podrías indicar tu nombre completo?');
      return;
    }
  }

  if (text === 'no') {
    // Volvemos al menú
    userState.topic = null;
    await chat.sendMessage('Entendido. Volvamos al menú principal.');
    await enviarMenu(message);
    return;
  }

  // Fallback final
  await chat.sendMessage(
    `Lo siento, no reconozco esa opción.\n` +
    `Si deseas volver al menú, escribe "menu".`
  );
});

// Iniciamos el cliente
client.initialize();
