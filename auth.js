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

// --- DOM ЭЛЕМЕНТЫ (Auth) ---
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

const profileAvatarImg = document.getElementById('profile-avatar');
const avatarUploadInput = document.getElementById('avatar-upload-input');
const avatarStatusMessage = document.getElementById('avatar-status-message'); // <-- ЭТОТ ЭЛЕМЕНТ ТЕПЕРЬ СУЩЕСТВУЕТ
const gameHistoryList = document.getElementById('game-history-list'); // <-- ЭТОТ ЭЛЕМЕНТ ТЕПЕРЬ СУЩЕСТВУЕТ


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
 * Вспомогательная функция для управления модальными окнами Bootstrap
 */
function getBootstrapModalInstance(element) {
    if (!element) return null;
    let modalInstance = bootstrap.Modal.getInstance(element);
    if (!modalInstance) {
        modalInstance = new bootstrap.Modal(element);
    }
    return modalInstance;
}


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

    if (avatarStatusMessage) avatarStatusMessage.textContent = 'Загрузка...'; // <-- ИСПРАВЛЕНО
    
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
            const initialData = {
                highScore: window.highScore || 0,
                email: currentUser.email,
                nickname: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Anon'),
                avatarURL: null,
                gameHistory: JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
            };
            await db.collection("users").doc(userId).set(initialData);
            data = initialData;
            localStorage.removeItem(HISTORY_KEY); // Очищаем локальную историю после миграции
        }

        if (highScoreValueElement) {
            window.highScore = data.highScore || 0;
            highScoreValueElement.textContent = window.highScore;
        }

        const nickname = data.nickname || (data.email ? data.email.split('@')[0] : 'Anon');
        if (profileNicknameElement) profileNicknameElement.textContent = `Никнейм: ${nickname}`;
        if (profileEmailElement) profileEmailElement.textContent = `Email: ${data.email || 'Нет'}`;
        if (profileHighScoreElement) profileHighScoreElement.textContent = `Рекорд: ${data.highScore || 0} очков`;
        
        if (profileAvatarImg) profileAvatarImg.src = data.avatarURL || 'default_avatar.png';
        loadGameHistory(data.gameHistory);

    } catch (error) {
        console.error("Ошибка загрузки профиля:", error);
    }
}

async function showProfileModal(userId) {
    currentProfileUserId = userId;
    if (profileMessage) profileMessage.textContent = 'Загрузка данных...';
    
    // Используем Bootstrap JS для управления видимостью формы
    if (editProfileButton) editProfileButton.style.display = 'none';
    if (editProfileForm) editProfileForm.style.display = 'none';

    try {
        const doc = await db.collection("users").doc(userId).get();
        if (!doc.exists) {
            if (profileMessage) profileMessage.textContent = 'Ошибка: Профиль не найден.';
            getBootstrapModalInstance(profileModal).show(); 
            return;
        }
        
        const data = doc.data();
        const isCurrentUser = currentUser && currentUser.uid === userId; 

        const nickname = data.nickname || (data.email ? data.email.split('@')[0] : 'Anon');
        
        if (profileNicknameElement) profileNicknameElement.textContent = `Никнейм: ${nickname}`;
        if (profileHighScoreElement) profileHighScoreElement.textContent = `Рекорд: ${data.highScore || 0} очков`;
        
        if (profileEmailElement) {
            profileEmailElement.textContent = isCurrentUser 
                ? `Email: ${data.email || 'Нет'}` 
                : `Email: Скрыто`; 
        }
        
        if (profileAvatarImg) profileAvatarImg.src = data.avatarURL || 'default_avatar.png';
        loadGameHistory(data.gameHistory);

        if (isCurrentUser) {
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
            avatarURL: data.avatarURL || null
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
// ЛОГИКА АУТЕНТИФИКАЦИИ (Вход/Регистрация/Выход)
// ====================================================================

function handleAuthToggle() {
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
        
        getBootstrapModalInstance(authModal).hide(); // Закрываем модальное окно входа

    } else {
        if (authButton) authButton.textContent = 'Вход/Регистрация';
        
        const localHighScore = window.highScore || 0;
        if (highScoreValueElement) {
            window.highScore = localHighScore;
            highScoreValueElement.textContent = localHighScore;
        }
    }
});


// --- ИНИЦИАЛИЗАЦИЯ AUTH ЛОГИКИ ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Обработчики аутентификации (УСЛОВНАЯ ПРОВЕРКА ИСПРАВЛЯЕТ ОШИБКИ NULL)
    if (authToggleButton) authToggleButton.onclick = handleAuthToggle; // <-- ИСПРАВЛЕНО
    if (authForm) authForm.onsubmit = handleAuthFormSubmit; 
    if (logoutButton) logoutButton.onclick = handleLogout; // <-- ИСПРАВЛЕНО
    
    // Обработчики профиля
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
