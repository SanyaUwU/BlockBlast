// auth.js
(function() {
    // --- КОНФИГУРАЦИЯ FIREBASE ---
    const firebaseConfig = {
        apiKey: "AIzaSyCZDX-LeysLeE7tOAmhT3iwQ", // Использование заглушки
        authDomain: "block-blast-leader.firebaseapp.com",
        projectId: "block-blast-leader",
        storageBucket: "block-blast-leader.firebasestorage.app",
        messagingSenderId: "435353232888",
        appId: "1:435353232888:web:79480b0345c0209e8d220d",
        measurementId: "G-ZKCKX6NBKZ"
    };

    // --- КОНСТАНТЫ (ИЗОЛИРОВАНЫ) ---
    const HISTORY_KEY = 'gameHistory'; 
    const DISPLAY_HISTORY_LIMIT = 3; // Ограничение на отображение истории (3 игры)

    // --- ПЕРЕМЕННЫЕ СОСТОЯНИЯ (Auth) ---
    let currentUser = null;
    let currentProfileUserId = null; 

    // --- DOM ЭЛЕМЕНТЫ ---
    const authButton = document.getElementById('auth-button'); 
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const authMessage = document.getElementById('auth-message');
    const authToggleButton = document.getElementById('auth-toggle-button');
    const logoutButton = document.getElementById('logout-button');

    const leaderboardModal = document.getElementById('leaderboard-modal');
    const leaderboardList = document.getElementById('leaderboard-list');
    const leaderboardButton = document.getElementById('leaderboard-button');

    const profileModal = document.getElementById('profile-modal');
    const profileNicknameElement = document.getElementById('profile-nickname');
    const profileEmailElement = document.getElementById('profile-email');
    const profileHighScoreElement = document.getElementById('profile-high-score');
    const editProfileButton = document.getElementById('edit-profile-button');
    const editProfileForm = document.getElementById('edit-profile-form');
    const editNicknameInput = document.getElementById('edit-nickname-input');
    const profileMessage = document.getElementById('profile-message');
    const cancelEditButton = document.getElementById('cancel-edit-button');

    // Элементы Аватара и Истории
    const profileAvatarImg = document.getElementById('profile-avatar');
    const avatarUploadInput = document.getElementById('avatar-upload-input');
    const avatarStatusMessage = document.getElementById('avatar-status-message');
    const gameHistoryList = document.getElementById('game-history-list');
    const avatarUploadSection = document.getElementById('avatar-upload-section'); // ДОБАВЛЕНО

    // Инициализируем Firebase
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    } else if (typeof firebase === 'undefined') {
        console.error("Firebase SDK не загружен. Проверьте index.html.");
    }
    const auth = firebase.auth();
    const db = firebase.firestore();
    // Storage нужен для аватаров
    const storage = firebase.storage(); 

    // Делаем переменные глобально доступными для game.js
    window.currentUser = currentUser;

    /**
     * Вспомогательная функция для управления модальными окнами Bootstrap
     */
    function getBootstrapModalInstance(element) {
        if (!element || typeof bootstrap === 'undefined') return { show: () => {}, hide: () => {} };
        let modalInstance = bootstrap.Modal.getInstance(element);
        if (!modalInstance) {
            modalInstance = new bootstrap.Modal(element);
        }
        return modalInstance;
    }

    /**
     * Обновляет рекорд в Firestore. Вызывается из game.js.
     * @param {number} newScore Новый рекорд.
     */
    window.updateHighScore = async function(newScore) {
        if (!currentUser) return;
        try {
            await db.collection("users").doc(currentUser.uid).set({
                highScore: newScore
            }, { merge: true });
            console.log("Рекорд обновлен!");
        } catch (error) {
            console.error("Ошибка обновления рекорда:", error);
        }
    }

    /**
     * Обновляет историю игр в Firestore. Вызывается из game.js.
     * @param {Array<Object>} historyData Обновленный массив истории.
     */
    window.updateGameHistory = async (historyData) => {
        if (!currentUser) return;
        try {
            // Ограничиваем историю до 5 записей (это для хранения)
            const limitedHistory = historyData.slice(0, 5); 
            await db.collection('users').doc(currentUser.uid).set({
                gameHistory: limitedHistory
            }, { merge: true });
            // Вызываем loadGameHistory для обновления UI, передавая полную историю, 
            // которая будет ограничена до 3-х внутри.
            loadGameHistory(limitedHistory); 
        } catch (error) {
            console.error("Ошибка при обновлении истории игр:", error);
        }
    };

    // ====================================================================
    // ЛОГИКА АВАТАРА
    // ====================================================================

    const uploadAvatar = (file) => {
        if (!currentUser || !file) return;

        if (avatarStatusMessage) avatarStatusMessage.textContent = 'Загрузка...';
        
        const fileExtension = file.name.split('.').pop();
        // Используем метку времени в имени файла для обхода кеширования
        const fileName = `${currentUser.uid}_${Date.now()}.${fileExtension}`; 
        const storageRefPath = storage.ref(`avatars/${currentUser.uid}/${fileName}`);
        const uploadTask = storageRefPath.put(file);

        uploadTask.on('state_changed', 
            (snapshot) => {
                // Логика отслеживания прогресса для исправления "зависания на 0%"
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if (avatarStatusMessage) avatarStatusMessage.textContent = `Загрузка: ${Math.round(progress)}%`;
            }, 
            (error) => {
                console.error("Ошибка загрузки:", error);
                if (avatarStatusMessage) avatarStatusMessage.textContent = `Ошибка: ${error.message}`;
            }, 
            () => {
                uploadTask.snapshot.ref.getDownloadURL().then(async (downloadURL) => {
                    
                    await db.collection("users").doc(currentUser.uid).set({
                        avatarURL: downloadURL
                    }, { merge: true });

                    if (profileAvatarImg) profileAvatarImg.src = downloadURL;
                    if (avatarStatusMessage) avatarStatusMessage.textContent = 'Аватар обновлен!';
                    setTimeout(() => { if (avatarStatusMessage) avatarStatusMessage.textContent = ''; }, 3000);
                }).catch(e => {
                     if (avatarStatusMessage) avatarStatusMessage.textContent = 'Ошибка сохранения URL.';
                });
            }
        );
    };

    // ====================================================================
    // ЛОГИКА ИСТОРИИ ИГР
    // ====================================================================

    function loadGameHistory(history) {
        if (!gameHistoryList) return; 

        // Если история передана из Firebase, используем ее. Иначе читаем из LocalStorage (для неавторизованных)
        const allGames = history || JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        
        // ИЗМЕНЕНИЕ: Ограничиваем до 3 последних игр для отображения
        const games = allGames.slice(0, DISPLAY_HISTORY_LIMIT); 
        
        gameHistoryList.innerHTML = '';
        
        if (games.length === 0) {
            gameHistoryList.innerHTML = '<li class="list-group-item text-secondary">История игр пуста.</li>';
            return;
        }

        games.forEach(game => {
            const date = new Date(game.date).toLocaleDateString('ru-RU', { 
                year: 'numeric', month: 'short', day: 'numeric' 
            });
            
            const modeColor = game.mode.includes('Обычный') ? 'success' : 'warning';
            
            const listItem = document.createElement('li');
            listItem.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
            listItem.innerHTML = `
                <div>
                    <strong class="text-primary">${game.score} очков</strong> 
                    <span class="badge bg-${modeColor} ms-2">${game.mode}</span>
                    <small class="d-block text-muted">Линий: ${game.lines} | ${date}</small>
                </div>
            `;
            gameHistoryList.appendChild(listItem);
        });
    }

    // ====================================================================
    // ЛОГИКА ПРОФИЛЯ
    // ====================================================================

    async function fetchProfile(userId) {
        const highScoreValueElement = document.getElementById('high-score-value');
        try {
            const doc = await db.collection("users").doc(userId).get();
            let data = doc.exists ? doc.data() : null;

            if (!data) {
                // Если профиль не существует, создаем его, мигрируя локальную историю
                const initialData = {
                    highScore: window.highScore || 0,
                    email: currentUser.email,
                    nickname: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Anon'),
                    avatarURL: null,
                    gameHistory: JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
                };
                await db.collection("users").doc(userId).set(initialData);
                data = initialData;
                localStorage.removeItem(HISTORY_KEY); 
            }

            if (highScoreValueElement) {
                window.highScore = data.highScore || 0;
                highScoreValueElement.textContent = window.highScore;
            }

            const nickname = data.nickname || (data.email ? data.email.split('@')[0] : 'Anon');
            if (profileAvatarImg) profileAvatarImg.src = data.avatarURL || 'default_avatar.png';
            
        } catch (error) {
            console.error("Ошибка загрузки профиля:", error);
        }
    }

    async function showProfileModal(userId) {
        currentProfileUserId = userId;
        if (profileMessage) profileMessage.textContent = 'Загрузка данных...';
        
        // Скрываем форму редактирования по умолчанию
        if (editProfileButton) editProfileButton.style.display = 'none';
        if (editProfileForm) editProfileForm.style.display = 'none';
        
        const isCurrentUser = currentUser && currentUser.uid === userId; 
        
        // --- ИЗМЕНЕНИЕ: Управление видимостью секции загрузки аватара и кнопок ---
        if (avatarUploadSection) { 
            // Кнопка загрузки аватара видна только для своего профиля
            avatarUploadSection.style.display = isCurrentUser ? 'block' : 'none';
        }

        const profileFooter = document.querySelector('#profile-modal .modal-body .d-flex.justify-content-between');
        if (profileFooter) {
            // Секция с кнопками (Редактировать/Выход) видна только для своего профиля
            profileFooter.style.display = isCurrentUser ? 'flex' : 'none'; 
        }


        try {
            const doc = await db.collection("users").doc(userId).get();
            if (!doc.exists) {
                if (profileMessage) profileMessage.textContent = 'Ошибка: Профиль не найден.';
                getBootstrapModalInstance(profileModal).show(); 
                return;
            }
            
            const data = doc.data();
            
            const nickname = data.nickname || (data.email ? data.email.split('@')[0] : 'Anon');
            
            if (profileNicknameElement) profileNicknameElement.textContent = `Никнейм: ${nickname}`;
            if (profileHighScoreElement) profileHighScoreElement.textContent = `Рекорд: ${data.highScore || 0} очков`;
            
            if (profileEmailElement) {
                // Email показываем только для своего профиля
                profileEmailElement.textContent = isCurrentUser 
                    ? `Email: ${data.email || 'Нет'}` 
                    : `Email: Скрыто`; 
            }
            
            if (profileAvatarImg) profileAvatarImg.src = data.avatarURL || 'default_avatar.png';
            
            // Передаем историю конкретного пользователя, которая будет обрезана до 3 в loadGameHistory
            loadGameHistory(data.gameHistory); 

            if (isCurrentUser) {
                // Если это свой профиль, показываем кнопку редактирования
                if (editProfileButton) editProfileButton.style.display = 'block';
            }
            
            if (profileMessage) profileMessage.textContent = '';
            getBootstrapModalInstance(profileModal).show();

        } catch (error) {
            console.error("Ошибка при отображении профиля:", error);
            if (profileMessage) profileMessage.textContent = 'Ошибка загрузки профиля.';
            getBootstrapModalInstance(profileModal).show(); 
        }
    }

    async function handleProfileEdit(event) {
        event.preventDefault();
        if (profileMessage) profileMessage.textContent = 'Сохранение...';

        const newNickname = editNicknameInput.value.trim();

        if (!currentUser || currentUser.uid !== currentProfileUserId) {
            if (profileMessage) profileMessage.textContent = 'Ошибка: Вы не можете редактировать этот профиль.';
            return;
        }
        if (newNickname.length < 3 || newNickname.length > 20) {
            if (profileMessage) profileMessage.textContent = 'Ошибка: Никнейм должен быть от 3 до 20 символов.';
            return;
        }
        
        try {
            const snapshot = await db.collection("users")
                .where("nickname", "==", newNickname)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                const docId = snapshot.docs[0].id;
                if (docId !== currentUser.uid) {
                    if (profileMessage) profileMessage.textContent = 'Ошибка: Никнейм уже занят другим пользователем.';
                    return;
                }
            }
        } catch (error) {
            console.error("Ошибка проверки никнейма:", error);
            if (profileMessage) profileMessage.textContent = 'Ошибка сервера при проверке никнейма.';
            return;
        }
        
        let data = {};
        try {
            const doc = await db.collection("users").doc(currentUser.uid).get();
            if (doc.exists) {
                data = doc.data();
            }
        } catch (error) {
            console.error("Ошибка получения текущих данных профиля:", error);
            if (profileMessage) profileMessage.textContent = 'Ошибка при получении текущих данных профиля.';
            return;
        }

        try {
            await db.collection("users").doc(currentUser.uid).set({
                nickname: newNickname,
                highScore: data.highScore || 0, 
                email: currentUser.email,
                avatarURL: data.avatarURL || null,
                gameHistory: data.gameHistory || [],
            }, { merge: true }); 

            await currentUser.updateProfile({
                displayName: newNickname
            });

            if (authButton) authButton.textContent = `Профиль (${newNickname})`;
            if (profileNicknameElement) profileNicknameElement.textContent = `Никнейм: ${newNickname}`;
            if (profileMessage) profileMessage.textContent = 'Никнейм успешно обновлен!';
            
            hideEditProfile();
            loadLeaderboard();
        } catch (error) {
            console.error("Ошибка сохранения профиля:", error);
            if (profileMessage) profileMessage.textContent = `Ошибка сохранения: ${error.message}`;
        }
    }

    function hideEditProfile() {
        if (editProfileButton) editProfileButton.style.display = 'block';
        if (editProfileForm) editProfileForm.style.display = 'none';
        if (profileMessage) profileMessage.textContent = '';
    }

    // ====================================================================
    // ЛОГИКА ТАБЛИЦЫ ЛИДЕРОВ
    // ====================================================================

    async function loadLeaderboard() {
        if (leaderboardList) leaderboardList.innerHTML = '<li class="list-group-item text-center">Загрузка...</li>';
        try {
            const snapshot = await db.collection("users")
                .orderBy("highScore", "desc")
                .limit(10)
                .get();
            
            if (leaderboardList) leaderboardList.innerHTML = ''; 
            let rank = 1;
            
            if (snapshot.empty) {
                if (leaderboardList) leaderboardList.innerHTML = '<li class="list-group-item text-center">Таблица лидеров пуста. Будьте первым!</li>';
            } else {
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const nickname = data.nickname || (data.email ? data.email.split('@')[0] : 'Anon');
                    const li = document.createElement('li');
                    li.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
                    li.innerHTML = `
                        <div>
                            <strong>#${rank}</strong> ${nickname}
                        </div>
                        <div>
                            <span class="badge bg-primary me-2">${data.highScore || 0} очков</span>
                            <button class="btn btn-sm btn-outline-secondary view-profile-button" data-user-id="${doc.id}">Профиль</button>
                        </div>
                    `;
                    if (leaderboardList) leaderboardList.appendChild(li);
                    rank++;
                });
                
                document.querySelectorAll('.view-profile-button').forEach(button => {
                    button.onclick = (e) => {
                        e.stopPropagation(); 
                        const userId = e.target.dataset.userId;
                        getBootstrapModalInstance(leaderboardModal).hide(); 
                        showProfileModal(userId); 
                    };
                });
            }
        } catch (error) {
            console.error("Ошибка загрузки таблицы лидеров:", error);
            if (leaderboardList) leaderboardList.innerHTML = '<li class="list-group-item text-danger text-center">Не удалось загрузить таблицу.</li>';
        }
    }

    // ====================================================================
    // ЛОГИКА АУТЕНТИФИКАЦИИ
    // ====================================================================

    function handleAuthToggle() {
        const loginButton = document.getElementById('auth-login-button');
        if (!loginButton) return;

        const isLoginMode = loginButton.textContent.includes('Войти');

        if (isLoginMode) {
            authToggleButton.textContent = 'Уже есть аккаунт? Вход';
            loginButton.textContent = 'Зарегистрироваться';
        } else {
            authToggleButton.textContent = 'Нет аккаунта? Зарегистрироваться';
            loginButton.textContent = 'Войти';
        }
    }

    async function handleAuthFormSubmit(event) {
        event.preventDefault();
        if (authMessage) authMessage.textContent = '';

        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const isLoginMode = document.getElementById('auth-login-button').textContent.includes('Войти');
        
        try {
            if (isLoginMode) {
                await auth.signInWithEmailAndPassword(email, password);
            } else {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                const user = userCredential.user;
                const nickname = email.split('@')[0];
                
                await user.updateProfile({
                    displayName: nickname
                });
                
                // Создаем профиль, мигрируя локальную историю
                await db.collection("users").doc(user.uid).set({
                    highScore: window.highScore || 0,
                    email: email,
                    nickname: nickname,
                    gameHistory: JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
                });

                localStorage.removeItem(HISTORY_KEY);
                
                if (authMessage) authMessage.textContent = 'Регистрация прошла успешно!';
            }
            
        } catch (error) {
            console.error("Ошибка аутентификации:", error);
            if (authMessage) authMessage.textContent = `Ошибка: ${error.message}`;
        }
    }

    function handleLogout() {
        auth.signOut();
        getBootstrapModalInstance(profileModal).hide();
    }


    // ====================================================================
    // ОБРАБОТЧИКИ СОСТОЯНИЯ
    // ====================================================================

    auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        window.currentUser = user;
        const highScoreValueElement = document.getElementById('high-score-value');
        
        if (user) {
            const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Anon');
            if (authButton) authButton.textContent = `Профиль (${displayName})`;
            
            await fetchProfile(user.uid); 
            
            getBootstrapModalInstance(authModal).hide();

        } else {
            if (authButton) authButton.textContent = 'Вход/Регистрация';
            
            // Если пользователь вышел, но есть локальный рекорд, сохраняем его
            const localHighScore = window.highScore || 0;
            if (highScoreValueElement) {
                window.highScore = localHighScore;
                highScoreValueElement.textContent = localHighScore;
            }
            // Также загружаем локальную историю для отображения
            loadGameHistory();
        }
    });


    // --- ИНИЦИАЛИЗАЦИЯ AUTH ЛОГИКИ ---
    document.addEventListener('DOMContentLoaded', () => {
        
        if (authToggleButton) authToggleButton.onclick = handleAuthToggle;
        if (authForm) authForm.onsubmit = handleAuthFormSubmit;
        if (logoutButton) logoutButton.onclick = handleLogout;
        
        if (editProfileButton) {
            editProfileButton.onclick = () => {
                if (editProfileButton) editProfileButton.style.display = 'none';
                if (editProfileForm) editProfileForm.style.display = 'block';
                const currentNicknameText = profileNicknameElement.textContent.replace('Никнейм:', '').trim();
                if (editNicknameInput) editNicknameInput.value = currentNicknameText; 
                if (profileMessage) profileMessage.textContent = '';
            };
        }
        if (cancelEditButton) cancelEditButton.onclick = hideEditProfile;
        if (editProfileForm) editProfileForm.onsubmit = handleProfileEdit;
        
        // Обработчик загрузки аватара
        if (avatarUploadInput) {
            avatarUploadInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    uploadAvatar(e.target.files[0]);
                }
            });
        }

        // Клик по кнопке "Профиль"
        if (authButton) {
            authButton.onclick = () => {
                if (currentUser) {
                    showProfileModal(currentUser.uid); 
                } else {
                    getBootstrapModalInstance(authModal).show();
                }
            };
        }
        
        // Кнопка "Топ 10"
        if (leaderboardButton) {
            leaderboardButton.onclick = () => {
                loadLeaderboard();
                getBootstrapModalInstance(leaderboardModal).show();
            };
        }
    });

})();
