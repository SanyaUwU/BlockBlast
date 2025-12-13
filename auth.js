// auth.js

// --- КОНФИГУРАЦИЯ FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyCZDfxdQ7VGTZEw-LeysLeE7tOAmhT3iwQ",
    authDomain: "block-blast-leader.firebaseapp.com",
    projectId: "block-blast-leader",
    storageBucket: "block-blast-leader.firebasestorage.app",
    messagingSenderId: "435353232888",
    appId: "1:435353232888:web:79480b0345c0209e8d220d",
    measurementId: "G-ZKCKX6NBKZ"
};

// --- КОНСТАНТЫ ---
const HISTORY_KEY = 'gameHistory'; 

// --- ПЕРЕМЕННЫЕ СОСТОЯНИЯ (Auth) ---
let currentUser = null;
let currentProfileUserId = null; 
let profileModalInstance = null; // Для управления модальным окном Bootstrap

// --- DOM ЭЛЕМЕНТЫ (Auth) ---
const authButton = document.getElementById('auth-button'); // Предполагаем, что это кнопка "Профиль"
const authModal = document.getElementById('auth-modal'); // Модальное окно Входа/Регистрации
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

// Новые элементы для аватара и истории
const profileAvatarImg = document.getElementById('profile-avatar');
const avatarUploadInput = document.getElementById('avatar-upload-input');
const avatarStatusMessage = document.getElementById('avatar-status-message');
const gameHistoryList = document.getElementById('game-history-list');

// Все кнопки закрытия модальных окон (Bootstrap-only)
// const closeButtons = document.querySelectorAll('.btn-close'); 


// --- ФУНКЦИИ FIREBASE (АУТЕНТИФИКАЦИЯ, СЧЕТ) ---

// Инициализируем Firebase и делаем объекты доступными
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else if (typeof firebase === 'undefined') {
    console.error("Firebase SDK не загружен. Проверьте index.html.");
}
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Делаем переменные глобально доступными для game.js
window.currentUser = currentUser;

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
 * @param {Array<Object>} historyData Массив последних игр.
 */
window.updateGameHistory = async (historyData) => {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).set({
            gameHistory: historyData
        }, { merge: true });
        loadGameHistory(historyData); 
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
    
    // Имя файла: UID пользователя + расширение
    const fileExtension = file.name.split('.').pop();
    const fileName = `${currentUser.uid}.${fileExtension}`;
    const storageRefPath = storage.ref(`avatars/${currentUser.uid}/${fileName}`);
    const uploadTask = storageRefPath.put(file);

    uploadTask.on('state_changed', 
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (avatarStatusMessage) avatarStatusMessage.textContent = `Загрузка: ${Math.round(progress)}%`;
        }, 
        (error) => {
            console.error("Ошибка загрузки:", error);
            if (avatarStatusMessage) avatarStatusMessage.textContent = `Ошибка: ${error.message}`;
        }, 
        () => {
            // Успешное завершение
            uploadTask.snapshot.ref.getDownloadURL().then(async (downloadURL) => {
                
                // 1. Сохраняем URL в Firestore
                await db.collection("users").doc(currentUser.uid).set({
                    avatarURL: downloadURL
                }, { merge: true });

                // 2. Обновляем UI
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

    // Используем переданную историю или LocalStorage
    const games = history || JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    
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
// ЛОГИКА ПРОФИЛЯ (Отображение/Редактирование)
// ====================================================================

async function fetchProfile(userId) {
    const highScoreValueElement = document.getElementById('high-score-value');
    try {
        const doc = await db.collection("users").doc(userId).get();
        let data = doc.exists ? doc.data() : null;

        if (!data) {
            // Создание базового профиля
            const initialData = {
                highScore: 0,
                email: currentUser.email,
                nickname: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Anon'),
                avatarURL: null,
                gameHistory: JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') // Миграция локальной истории
            };
            await db.collection("users").doc(userId).set(initialData);
            data = initialData;
        }

        // Обновляем highScore в game.js и UI
        if (highScoreValueElement) {
            window.highScore = data.highScore || 0;
            highScoreValueElement.textContent = window.highScore;
        }

        // Обновляем UI профиля
        const nickname = data.nickname || (data.email ? data.email.split('@')[0] : 'Anon');
        profileNicknameElement.textContent = `Никнейм: ${nickname}`;
        profileEmailElement.textContent = `Email: ${data.email || 'Нет'}`;
        profileHighScoreElement.textContent = `Рекорд: ${data.highScore || 0} очков`;
        
        // Обновляем Аватар
        if (profileAvatarImg) {
            profileAvatarImg.src = data.avatarURL || 'default_avatar.png';
        }

        // Обновляем Историю
        loadGameHistory(data.gameHistory);

    } catch (error) {
        console.error("Ошибка загрузки профиля:", error);
    }
}

async function showProfileModal(userId) {
    currentProfileUserId = userId;
    profileMessage.textContent = 'Загрузка данных...';
    
    // Скрываем форму редактирования и показываем кнопку
    editProfileButton.style.display = 'none';
    editProfileForm.style.display = 'none';

    try {
        const doc = await db.collection("users").doc(userId).get();
        if (!doc.exists) {
            profileMessage.textContent = 'Ошибка: Профиль не найден.';
            // Используем Bootstrap JS для показа модального окна
            if (profileModalInstance) profileModalInstance.show(); 
            return;
        }
        
        const data = doc.data();
        const isCurrentUser = currentUser && currentUser.uid === userId; 

        const nickname = data.nickname || (data.email ? data.email.split('@')[0] : 'Anon');
        
        profileNicknameElement.textContent = `Никнейм: ${nickname}`;
        profileHighScoreElement.textContent = `Рекорд: ${data.highScore || 0} очков`;
        
        // Условие отображения email
        profileEmailElement.textContent = isCurrentUser 
            ? `Email: ${data.email || 'Нет'}` 
            : `Email: Скрыто`; 
        
        // Обновляем Аватар
        if (profileAvatarImg) {
            profileAvatarImg.src = data.avatarURL || 'default_avatar.png';
        }

        // Обновляем Историю
        loadGameHistory(data.gameHistory);

        if (isCurrentUser) {
            editProfileButton.style.display = 'block';
        }
        
        profileMessage.textContent = '';
        // Используем Bootstrap JS для показа модального окна
        if (profileModalInstance) profileModalInstance.show();

    } catch (error) {
        console.error("Ошибка при отображении профиля:", error);
        profileMessage.textContent = 'Ошибка загрузки профиля.';
        if (profileModalInstance) profileModalInstance.show(); 
    }
}

async function handleProfileEdit(event) {
    event.preventDefault();
    profileMessage.textContent = 'Сохранение...';

    const newNickname = editNicknameInput.value.trim();

    if (!currentUser || currentUser.uid !== currentProfileUserId) {
        profileMessage.textContent = 'Ошибка: Вы не можете редактировать этот профиль.';
        return;
    }
    if (newNickname.length < 3 || newNickname.length > 20) {
        profileMessage.textContent = 'Ошибка: Никнейм должен быть от 3 до 20 символов.';
        return;
    }
    
    // Проверка на уникальность никнейма (исключая текущего пользователя)
    try {
        const snapshot = await db.collection("users")
            .where("nickname", "==", newNickname)
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const docId = snapshot.docs[0].id;
            if (docId !== currentUser.uid) {
                profileMessage.textContent = 'Ошибка: Никнейм уже занят другим пользователем.';
                return;
            }
        }
    } catch (error) {
        console.error("Ошибка проверки никнейма:", error);
        profileMessage.textContent = 'Ошибка сервера при проверке никнейма.';
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
        profileMessage.textContent = 'Ошибка при получении текущих данных профиля.';
        return;
    }

    try {
        // Обновляем Firestore
        await db.collection("users").doc(currentUser.uid).set({
            nickname: newNickname,
            highScore: data.highScore || 0, 
            email: currentUser.email,
            avatarURL: data.avatarURL || null
        }, { merge: true }); 

        // Обновляем DisplayName в Firebase Auth
        await currentUser.updateProfile({
            displayName: newNickname
        });

        // Обновляем UI
        authButton.textContent = `Профиль (${newNickname})`;
        profileNicknameElement.textContent = `Никнейм: ${newNickname}`;
        profileMessage.textContent = 'Никнейм успешно обновлен!';
        
        hideEditProfile();
        loadLeaderboard(); // Перезагружаем Топ-10 для обновления никнейма
    } catch (error) {
        console.error("Ошибка сохранения профиля:", error);
        profileMessage.textContent = `Ошибка сохранения: ${error.message}`;
    }
}

function hideEditProfile() {
    editProfileButton.style.display = 'block';
    editProfileForm.style.display = 'none';
    profileMessage.textContent = '';
}

// ====================================================================
// ЛОГИКА ТАБЛИЦЫ ЛИДЕРОВ
// ====================================================================

async function loadLeaderboard() {
    leaderboardList.innerHTML = '<li class="list-group-item text-center">Загрузка...</li>';
    try {
        const snapshot = await db.collection("users")
            .orderBy("highScore", "desc")
            .limit(10)
            .get();
        
        leaderboardList.innerHTML = ''; 
        let rank = 1;
        
        if (snapshot.empty) {
            leaderboardList.innerHTML = '<li class="list-group-item text-center">Таблица лидеров пуста. Будьте первым!</li>';
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
                leaderboardList.appendChild(li);
                rank++;
            });
            
            document.querySelectorAll('.view-profile-button').forEach(button => {
                button.onclick = (e) => {
                    e.stopPropagation(); 
                    const userId = e.target.dataset.userId;
                    // Предполагаем, что модальное окно Топ-10 закрывается Bootstrap JS
                    const leaderboardModalElement = document.getElementById('leaderboard-modal');
                    if (leaderboardModalElement) {
                        const modal = bootstrap.Modal.getInstance(leaderboardModalElement);
                        if (modal) modal.hide();
                    }
                    showProfileModal(userId); 
                };
            });
        }
    } catch (error) {
        console.error("Ошибка загрузки таблицы лидеров:", error);
        leaderboardList.innerHTML = '<li class="list-group-item text-danger text-center">Не удалось загрузить таблицу.</li>';
    }
}


// ====================================================================
// ЛОГИКА АУТЕНТИФИКАЦИИ (Вход/Регистрация/Выход)
// ====================================================================

function handleAuthToggle() {
    // В вашем оригинальном коде логика переключения была обратной:
    // Если на кнопке "Регистрация" -> переключаем на "Уже есть аккаунт? Вход" (т.е. режим входа)
    const loginButton = document.getElementById('auth-login-button');
    if (!loginButton) return;

    const isLoginMode = loginButton.textContent.includes('Войти');

    if (isLoginMode) {
        // Переключаем на РЕГИСТРАЦИЮ
        authToggleButton.textContent = 'Уже есть аккаунт? Вход';
        loginButton.textContent = 'Зарегистрироваться';
    } else {
        // Переключаем на ВХОД
        authToggleButton.textContent = 'Нет аккаунта? Зарегистрироваться';
        loginButton.textContent = 'Войти';
    }
}

async function handleAuthFormSubmit(event) {
    event.preventDefault();
    authMessage.textContent = '';

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const isLoginMode = document.getElementById('auth-login-button').textContent.includes('Войти');
    
    try {
        if (isLoginMode) {
            // ВХОД
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            // РЕГИСТРАЦИЯ
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            const nickname = email.split('@')[0];
            
            // Обновляем DisplayName в Auth
            await user.updateProfile({
                displayName: nickname
            });
            
            // Создаем запись в Firestore, копируя текущий локальный рекорд
            await db.collection("users").doc(user.uid).set({
                highScore: window.highScore || 0, // Используем локальный рекорд гостя
                email: email,
                nickname: nickname,
                gameHistory: JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') // Миграция локальной истории
            });

            // Очищаем локальную историю после миграции (опционально, но рекомендуется)
            localStorage.removeItem(HISTORY_KEY);
            
            authMessage.textContent = 'Регистрация прошла успешно!';
        }
        // Вход/Регистрация успешны, модальное окно закроется через onAuthStateChanged
        
    } catch (error) {
        console.error("Ошибка аутентификации:", error);
        authMessage.textContent = `Ошибка: ${error.message}`;
    }
}

function handleLogout() {
    auth.signOut();
    // Bootstrap должен закрыть модальное окно профиля
    if (profileModalInstance) profileModalInstance.hide();
}


// ====================================================================
// ОБРАБОТЧИКИ СОСТОЯНИЯ
// ====================================================================

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    window.currentUser = user; // Обновляем глобальный
    const highScoreValueElement = document.getElementById('high-score-value');
    
    if (user) {
        // Пользователь залогинен
        const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Anon');
        authButton.textContent = `Профиль (${displayName})`;
        
        // Получаем данные (рекорд, аватар, история)
        await fetchProfile(user.uid); 

        // Закрываем модальное окно входа, если оно открыто
        if (authModal) {
            const modal = bootstrap.Modal.getInstance(authModal);
            if (modal) modal.hide();
        }
        
    } else {
        // Пользователь - Гость
        authButton.textContent = 'Вход/Регистрация';
        
        // Обновляем High Score в UI и в game.js, используя локальное значение
        const localHighScore = window.highScore || 0;
        if (highScoreValueElement) {
            window.highScore = localHighScore;
            highScoreValueElement.textContent = localHighScore;
        }
    }
});


// --- ИНИЦИАЛИЗАЦИЯ AUTH ЛОГИКИ ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Инициализация Bootstrap модальных окон
    if (profileModal) {
        profileModalInstance = new bootstrap.Modal(profileModal);
    }
    
    // Обработчики аутентификации
    if (authToggleButton) authToggleButton.onclick = handleAuthToggle;
    if (authForm) authForm.onsubmit = handleAuthFormSubmit;
    if (logoutButton) logoutButton.onclick = handleLogout;
    
    // Обработчики профиля
    if (editProfileButton) {
        editProfileButton.onclick = () => {
            editProfileButton.style.display = 'none';
            editProfileForm.style.display = 'block';
            const currentNicknameText = profileNicknameElement.textContent.replace('Никнейм:', '').trim();
            editNicknameInput.value = currentNicknameText; 
            profileMessage.textContent = '';
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
                // Если залогинен, показываем профиль
                showProfileModal(currentUser.uid); 
            } else {
                // Если Гость, показываем модальное окно входа
                if (authModal) {
                    const modal = new bootstrap.Modal(authModal);
                    modal.show();
                }
            }
        };
    }
    
    // Кнопка "Топ 10"
    if (leaderboardButton) {
        leaderboardButton.onclick = () => {
            loadLeaderboard();
            // Предполагаем, что модальное окно Топ-10 показывается Bootstrap JS
            const leaderboardModalElement = document.getElementById('leaderboard-modal');
            if (leaderboardModalElement) {
                const modal = new bootstrap.Modal(leaderboardModalElement);
                modal.show();
            }
        };
    }
});
