document.addEventListener("DOMContentLoaded", () => {
  // Секретный код приглашения для регистрации (можешь поменять на свой)
  const VALID_INVITE_CODE = "DOLCE2026";

  const loginSection = document.getElementById("login");
  const registerSection = document.getElementById("register");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const tabButtons = document.querySelectorAll(".tabs button[data-mode]");
  const modeTriggers = document.querySelectorAll("[data-mode]");

  // Функция переключения вкладок (Вход / Регистрация)
  function switchMode(mode) {
    const isLogin = mode === "login";

    loginSection.hidden = !isLogin;
    registerSection.hidden = isLogin;

    tabButtons.forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.mode === mode ? "true" : "false");
    });

    // Прячем старые ошибки при переключении
    clearFeedback(loginForm);
    clearFeedback(registerForm);
  }

  modeTriggers.forEach((btn) => {
    btn.addEventListener("click", () => switchMode(btn.dataset.mode));
  });

  // Вывод ошибки в блок .feedback
  function showError(form, message) {
    const feedback = form.querySelector(".feedback");
    feedback.textContent = message;
    feedback.hidden = false;
  }

  function clearFeedback(form) {
    const feedback = form.querySelector(".feedback");
    feedback.textContent = "";
    feedback.hidden = true;
  }

  // Получение списка зарегистрированных пользователей из памяти браузера
  function getUsers() {
    return JSON.parse(localStorage.getItem("dolce_users") || "[]");
  }

  // Сохранение нового пользователя
  function saveUsers(users) {
    localStorage.setItem("dolce_users", JSON.stringify(users));
  }

  // --- ОБРАБОТКА РЕГИСТРАЦИИ ---
  registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearFeedback(registerForm);

    const name = registerForm.name.value.trim();
    const email = registerForm.email.value.trim().toLowerCase();
    const password = registerForm.password.value;
    const invite = registerForm.invite.value.trim();

    // 1. Проверка кода приглашения
    if (invite !== VALID_INVITE_CODE) {
      showError(registerForm, "Неверный код приглашения от администратора.");
      return;
    }

    // 2. Проверка, не занята ли почта
    const users = getUsers();
    const exists = users.some((user) => user.email === email);

    if (exists) {
      showError(registerForm, "Пользователь с такой почтой уже зарегистрирован. Перейдите во вкладку «Вход».");
      return;
    }

    // 3. Сохраняем аккаунт и сразу авторизуем
    const newUser = { name, email, password };
    users.push(newUser);
    saveUsers(users);
    localStorage.setItem("dolce_current_user", JSON.stringify(newUser));

    // Переход на основной сайт
    window.location.href = "index.html";
  });

  // --- ОБРАБОТКА ВХОДА ---
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearFeedback(loginForm);

    const email = loginForm.email.value.trim().toLowerCase();
    const password = loginForm.password.value;

    const users = getUsers();
    const foundUser = users.find((user) => user.email === email);

    // 1. Если почта не найдена в базе
    if (!foundUser) {
      showError(loginForm, "Аккаунт с такой почтой не найден. Сначала зарегистрируйтесь.");
      return;
    }

    // 2. Если почта есть, но пароль не подходит
    if (foundUser.password !== password) {
      showError(loginForm, "Неверный пароль. Проверьте правильность ввода.");
      return;
    }

    // 3. Успешный вход -> запоминаем сессию и кидаем на index.html
    localStorage.setItem("dolce_current_user", JSON.stringify(foundUser));
    window.location.href = "./dashboard.html";
  });
});