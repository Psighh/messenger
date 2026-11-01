document.addEventListener('DOMContentLoaded', () => {
    const formsWrapper = document.querySelector('.forms-wrapper');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const formContents = document.querySelectorAll('.form-content');

    // Установка корректной высоты обертки при загрузке страницы
    const activeFormOnLoad = document.querySelector('.form-content.active');
    if (activeFormOnLoad) {
        formsWrapper.style.height = `${activeFormOnLoad.scrollHeight}px`;
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            const targetForm = document.getElementById(`${targetTab}Form`);

            if (button.classList.contains('active')) return;

            // 1. Меняем активные вкладки
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // 2. Устанавливаем точную высоту контейнера ДО смены классов, чтобы избежать рывков
            formsWrapper.style.height = `${targetForm.scrollHeight}px`;

            // 3. Переключаем классы форм (начинается плавный кросс-фейд)
            formContents.forEach(form => form.classList.remove('active'));
            targetForm.classList.add('active');
        });
    });

    // Логика выбора роли при регистрации (Студент / Преподаватель)
    const roleButtons = document.querySelectorAll('.role-btn');
    const dynamicLabel = document.getElementById('dynamicLabel');
    const regExtraInput = document.getElementById('regExtra');

    roleButtons.forEach(button => {
        button.addEventListener('click', () => {
            roleButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const role = button.getAttribute('data-role');
            if (role === 'student') {
                dynamicLabel.textContent = 'Номер группы';
                regExtraInput.placeholder = 'Например: ПИБ24-Э1';
            } else {
                dynamicLabel.textContent = 'Кафедра';
                regExtraInput.placeholder = 'Например: ИСЭИУ, АТНИСТ';
            }

            // Корректируем высоту контейнера на лету, если форма открыта и меняется контент внутри
            const activeForm = document.querySelector('.form-content.active');
            if (activeForm) {
                formsWrapper.style.height = `${activeForm.scrollHeight}px`;
            }
        });
    });

    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        console.log('Вход:', { email, password });
        alert('Успешный вход в систему!');
    });

    // Обработка отправки формы регистрации
    const registerForm = document.getElementById('registerForm');
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const activeRole = document.querySelector('.role-btn.active').getAttribute('data-role');
        const name = document.getElementById('regName').value;
        const extraField = regExtraInput.value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;

        const formData = {
            role: activeRole,
            fullName: name,
            groupOrDepartment: extraField,
            email: email,
            password: password
        };

        console.log('Данные регистрации:', formData);
        alert(`Регистрация прошла успешно как ${activeRole === 'student' ? 'Студент' : 'Преподаватель'}!`);
    });
});