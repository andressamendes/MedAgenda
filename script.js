import { signIn, signOut, getSession, onAuthStateChange } from "./auth.js";

const emailInput    = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn      = document.getElementById("btn-login");
const logoutBtn     = document.getElementById("btn-logout");
const userSection   = document.getElementById("user-info");
const guestSection  = document.getElementById("guest-section");
const userName      = document.getElementById("user-name");
const userEmail     = document.getElementById("user-email");
const userId        = document.getElementById("user-id");
const userStatus    = document.getElementById("user-status");
const errorMsg      = document.getElementById("error-msg");

function renderSession(session) {
  if (session) {
    const user = session.user;
    userName.textContent  = user.user_metadata?.full_name || "—";
    userEmail.textContent = user.email;
    userId.textContent    = user.id;
    userStatus.textContent = "Autenticado";
    userStatus.className = "status autenticado";
    guestSection.hidden = true;
    userSection.hidden  = false;
  } else {
    userStatus.textContent = "Não autenticado";
    userStatus.className = "status nao-autenticado";
    guestSection.hidden = false;
    userSection.hidden  = true;
  }
}

loginBtn.addEventListener("click", async () => {
  errorMsg.textContent = "";
  const email    = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    errorMsg.textContent = "Preencha e-mail e senha.";
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando…";

  try {
    await signIn(email, password);
    passwordInput.value = "";
  } catch (err) {
    errorMsg.textContent = err.message || "Erro ao fazer login.";
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";
  }
});

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try {
    await signOut();
  } finally {
    logoutBtn.disabled = false;
  }
});

// Detecta mudanças de sessão em tempo real (login, logout, expiração)
onAuthStateChange(renderSession);

// Restaura sessão existente ao carregar a página
(async () => {
  const session = await getSession();
  renderSession(session);
})();
