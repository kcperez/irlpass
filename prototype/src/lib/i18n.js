// device-language i18n. spanish for es-* devices, english otherwise.
// english phrases are the keys, so anything untranslated falls back to english
// gracefully (never a blank or a [missing] tag).
const raw = (typeof navigator !== "undefined" && (navigator.language || navigator.userLanguage)) || "en"
export const LANG = raw.toLowerCase().startsWith("es") ? "es" : "en"

// voice-matched spanish: lowercase, warm, natural — not literal/robotic
const ES = {
  // ── landing / city page ──
  "the vetted travel club. every city, one club.": "el club de viajeros con filtro. cada ciudad, un club.",
  "members only": "solo miembros",
  "member sign in": "iniciar sesión",
  "open the club →": "entrar al club →",
  "medellín · live": "medellín · activa",
  "travelers here right now": "viajeros aquí ahora mismo",
  "{n} more this month": "{n} más este mes",
  "nobody lands alone": "nadie llega solo",
  "see the plans, tap i'm in, you've got people": "mira los planes, dale 'me apunto', y ya tienes gente",
  "every member is vetted": "cada miembro pasa por filtro",
  "application, real instagram, no weirdos": "aplicación, instagram real, sin raros",
  "dinner every thursday": "cena cada jueves",
  "six seats, members pick the spot": "seis puestos, los miembros eligen el lugar",
  "the club app is live": "la app del club ya está aquí",
  "activity board, city lobby, private chat per plan": "tablero de planes, lobby de la ciudad, chat privado por plan",
  "apply to join": "aplica para entrar",
  "soon": "pronto",

  // ── apply flow ──
  "what's your name?": "¿cómo te llamas?",
  "this goes on your pass": "esto va en tu pase",
  "first name": "nombre",
  "where are you from?": "¿de dónde eres?",
  "your flag goes on your pass": "tu bandera va en tu pase",
  "start typing… (colombia, usa, france)": "escribe… (colombia, usa, francia)",
  "what's your instagram?": "¿cuál es tu instagram?",
  "a real human checks this. not a bot, a human": "un humano de verdad lo revisa. no un bot, un humano",
  "last thing. where can we reach you?": "última cosa. ¿dónde te contactamos?",
  "your decision lands in your inbox, usually within 24 hours": "tu respuesta llega a tu correo, casi siempre en 24 horas",
  "when are you in medellín?": "¿cuándo estás en medellín?",
  "flexible counts — you'll still see who overlaps": "flexible cuenta — igual verás quién coincide",
  "what are you here for?": "¿a qué vienes?",
  "pick anything that's true": "elige lo que sea cierto",
  "next": "siguiente",
  "submit application": "enviar aplicación",
  "sending…": "enviando…",
  "couldn't send — check your connection and try again": "no se pudo enviar — revisa tu conexión e intenta de nuevo",

  // date options
  "i'm here right now": "estoy aquí ahora",
  "this month": "este mes",
  "next month": "el próximo mes",
  "flexible": "flexible",
  // reasons
  "dinners with strangers": "cenas con desconocidos",
  "food + nightlife": "comida + rumba",
  "day trips": "paseos de un día",
  "fitness + padel": "fitness + pádel",
  "coworking": "coworking",
  "just landed, know nobody": "recién llegué, no conozco a nadie",

  // ── received ──
  "you're on the list.": "estás en la lista.",
  "go pack. we'll email you.": "empaca. te escribimos.",
  "watch us build it": "míranos construirlo",
  "50 founding spots": "50 cupos fundadores",

  // ── offer ──
  "application approved": "aplicación aprobada",
  "claim spot nº {n} · {price}": "reclama el nº {n} · {price}",
  "opening checkout…": "abriendo el pago…",
  "per month": "al mes",
  "cancel anytime": "cancela cuando quieras",
  "per year": "al año",
  "save 42%": "ahorra 42%",
  "secure checkout by stripe": "pago seguro con stripe",
  "this link isn't active.": "este enlace no está activo.",

  // ── pass ──
  "you're": "estás",
  "in": "dentro",
  "founding member": "miembro fundador",
  "member": "miembro",
  "access": "acceso",
  "all cities": "todas las ciudades",
  "membership verified · valid in every irlpass city": "membresía verificada · válida en cada ciudad de irlpass",
  "enter the club": "entrar al club",
  "unlocking…": "desbloqueando…",
  "share your pass": "comparte tu pase",
  "copied. paste it anywhere": "copiado. pégalo donde sea",

  // ── club shell / tabs ──
  "board": "planes",
  "members": "miembros",
  "chats": "chats",
  "on the board": "en el tablero",
  "the club": "el club",
  "the map": "el mapa",
  "list": "lista",
  "i want to…": "quiero…",
  "grab coffee in laureles": "tomar café en laureles",
  "time (8pm, after lunch, flexible…)": "hora (8pm, después del almuerzo, flexible…)",
  "details (address, what to bring…) optional": "detalles (dirección, qué llevar…) opcional",
  "where? (pueblito paisa, alambique, parque lleras…)": "¿dónde? (pueblito paisa, alambique, parque lleras…)",
  "type the spot, we'll find it": "escribe el lugar, lo encontramos",
  "finding it…": "buscándolo…",
  "can't place it on the map, posting anyway": "no lo ubico en el mapa, lo publico igual",
  "add to the board": "publicar en el tablero",
  "posting…": "publicando…",
  "nothing on the board yet": "nada en el tablero todavía",
  "post the first plan. someone's waiting for exactly it.": "publica el primer plan. alguien lo está esperando.",
  "i'm in": "me apunto",
  "full": "lleno",
  "open chat": "abrir chat",
  "leave": "salir",
  "delete": "eliminar",
  "invite": "invitar",
  "going": "van",
  "tap a pin to join · ✦ = suggested": "toca un pin para unirte · ✦ = sugerido",
  "make it a plan": "vuélvelo un plan",
  "pick a day…": "elige un día…",
  "today": "hoy",
  "tomorrow": "mañana",
  "was {d}": "fue {d}",
  "founder suggestion": "sugerencia del fundador",
  "close": "cerrar",
  "no plan chats yet. join one on the board.": "aún no tienes chats de planes. únete a uno en el tablero.",
  "medellín lobby": "lobby de medellín",
  "all members · plans start here": "todos los miembros · los planes empiezan aquí",
  "your memories": "tus recuerdos",
  "add details": "agregar detalles",
  "edit": "editar",
  "no details yet": "sin detalles todavía",
  "address, meeting point, what to bring…": "dirección, punto de encuentro, qué llevar…",
  "save": "guardar",
  "message…": "mensaje…",
  "edit message…": "editar mensaje…",
  "no messages yet. say something.": "aún no hay mensajes. di algo.",
  "reply": "responder",
  "city lobby · all members": "lobby de la ciudad · todos los miembros",
  "private · joined members only": "privado · solo los que se unieron",
  "(edited)": "(editado)",
  "message deleted": "mensaje eliminado",
  "know someone who'd fit?": "¿conoces a alguien que encaje?",
  "invite them to apply. they still get vetted like everyone": "invítalo a aplicar. igual pasa por el filtro como todos",
  "copied. send it to them": "copiado. envíaselo",

  // ── profile sheet ──
  "add your photo": "agrega tu foto",
  "change your photo": "cambia tu foto",
  "uploading…": "subiendo…",
  "upload didn't take. try again": "la foto no subió. intenta de nuevo",
  "your face shows on the members list and in chats": "tu cara aparece en la lista de miembros y en los chats",
  "log in on your phone": "inicia sesión en tu teléfono",
  "scan with your camera. it opens the club, logged in as you.": "escanéalo con tu cámara. abre el club, con tu sesión.",
  "view my pass": "ver mi pase",
  "manage subscription": "gestionar suscripción",
  "log out": "cerrar sesión",

  // ── denied / auth ──
  "members only.": "solo miembros.",
  "this is the club side of irlpass. apply on the homepage and you'll get your own door key.":
    "este es el lado del club de irlpass. aplica en la página principal y tendrás tu propia llave.",
  "member sign in with google": "iniciar sesión con google",
  "or apply to join": "o aplica para entrar",
  "or email me my login link": "o envíame mi enlace por correo",
  "send": "enviar",
  "if that email is in our system, a login link is on its way.": "si ese correo está en nuestro sistema, ya va en camino tu enlace.",

  // ── invite page ──
  "you're invited": "estás invitado",
  "apply to join irlpass": "aplica para entrar a irlpass",
  "already a member? sign in": "¿ya eres miembro? inicia sesión",
  "members only · every application read by a founder": "solo miembros · cada aplicación la lee un fundador",
  "this invite expired.": "esta invitación venció.",

  // ── redeem ──
  "you've been invited in": "te invitaron a entrar",
  "someone vouched for you. no application, no fee.": "alguien respondió por ti. sin aplicación, sin pago.",
  "just tell us who you are so your pass has a name on it.": "solo dinos quién eres para ponerle nombre a tu pase.",
  "@instagram": "@instagram",
  "email": "correo",
  "claim my pass": "reclama mi pase",
  "letting you in…": "dejándote entrar…",
  "this code's used up.": "este código ya se usó.",
}

export function t(str, vars) {
  let out = LANG === "es" ? ES[str] || str : str
  if (vars) for (const k in vars) out = out.replace(new RegExp(`\\{${k}\\}`, "g"), vars[k])
  return out
}
