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

// Все кнопки закрытия модальных окон
const closeButtons = document.querySelectorAll('.close-button');


// --- ФУНКЦИИ FIREBASE (АУТЕНТИФИКАЦИЯ, СЧЕТ) ---

// Инициализируем Firebase и делаем объекты доступными
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

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

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    window.currentUser = user; // Обновляем глобальный
    const highScoreValueElement = document.getElementById('high-score-value');
    
    if (user) {
        authButton.textContent = `Профиль (${user.displayName || (user.email ? user.email.split('@')[0] : 'Anon')})`;
        logoutButton.style.display = 'block';
        await fetchProfile(user.uid); 
        authModal.style.display = 'none';
    } else {
        authButton.textContent = 'Вход/Регистрация';
        logoutButton.style.display = 'none';
        // Обновляем High Score в UI и в game.js
        if (highScoreValueElement) {
            window.highScore = 0;
            highScoreValueElement.textContent = 0;
        }
    }
});


async function fetchProfile(userId) {
    const highScoreValueElement = document.getElementById('high-score-value');
    try {
        const doc = await db.collection("users").doc(userId).get();
        if (doc.exists) {
            const data = doc.data();
            // Обновляем highScore в game.js
            if (highScoreValueElement) {
                window.highScore = data.highScore || 0;
                highScoreValueElement.textContent = window.highScore;
            }
        } else {
            // Создание базового профиля
            await db.collection("users").doc(userId).set({
                highScore: 0,
                email: currentUser.email,
                nickname: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Anon')
            });
        }
    } catch (error) {
        console.error("Ошибка загрузки профиля:", error);
    }
}

async function loadLeaderboard() {
    leaderboardList.innerHTML = '<li>Загрузка...</li>';
    try {
        const snapshot = await db.collection("users")
            .orderBy("highScore", "desc")
            .limit(10)
            .get();
        
        leaderboardList.innerHTML = ''; 
        let rank = 1;
        
        if (snapshot.empty) {
            leaderboardList.innerHTML = '<li>Таблица лидеров пуста. Будьте первым!</li>';
        } else {
            snapshot.forEach(doc => {
                const data = doc.data();
                const nickname = data.nickname || (data.email ? data.email.split('@')[0] : 'Anon');
                const li = document.createElement('li');
                li.innerHTML = `
                    <strong>#${rank}</strong> ${nickname}: <span>${data.highScore} очков</span>
                    <button class="game-button view-profile-button" data-user-id="${doc.id}" style="padding: 5px 10px; font-size: 0.8em; margin-left: 10px; background-image: linear-gradient(to right, #6c5ce7 0%, #a29bfe 100%);">Профиль</button>
                `;
                leaderboardList.appendChild(li);
                rank++;
            });
            
            document.querySelectorAll('.view-profile-button').forEach(button => {
                button.onclick = (e) => {
                    e.stopPropagation(); 
                    const userId = e.target.dataset.userId;
                    leaderboardModal.style.display = 'none'; 
                    showProfileModal(userId); 
                };
            });
        }
    } catch (error) {
        console.error("Ошибка загрузки таблицы лидеров:", error);
        leaderboardList.innerHTML = '<li>Не удалось загрузить таблицу. Проверьте соединение и правила Firestore.</li>';
    }
}

async function showProfileModal(userId) {
    currentProfileUserId = userId;
    profileMessage.textContent = 'Загрузка данных...';
    
    editProfileButton.style.display = 'none';
    editProfileForm.style.display = 'none';

    try {
        const doc = await db.collection("users").doc(userId).get();
        if (!doc.exists) {
            profileMessage.textContent = 'Ошибка: Профиль не найден.';
            profileModal.style.display = 'block';
            return;
        }
        
        const data = doc.data();
        const isCurrentUser = currentUser && currentUser.uid === userId; 

        profileNicknameElement.textContent = `Никнейм: ${data.nickname || (data.email ? data.email.split('@')[0] : 'Anon')}`;
        
        if (data.email) {
            profileEmailElement.textContent = isCurrentUser 
                ? `Email: ${data.email}` 
                : `Email: Скрыто`; 
        } else {
            profileEmailElement.textContent = 'Email: Нет';
        }
        
        profileHighScoreElement.textContent = `Рекорд: ${data.highScore || 0} очков`;

        if (isCurrentUser) {
            editProfileButton.style.display = 'block';
        }
        profileMessage.textContent = '';
        profileModal.style.display = 'block';

    } catch (error) {
        console.error("Ошибка при отображении профиля:", error);
        profileMessage.textContent = 'Ошибка загрузки профиля.';
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
        await db.collection("users").doc(currentUser.uid).set({
            nickname: newNickname,
            highScore: data.highScore || 0, 
            email: currentUser.email 
        }, { merge: true }); 

        await currentUser.updateProfile({
            displayName: newNickname
        });

        authButton.textContent = `Профиль (${newNickname})`;
        profileNicknameElement.textContent = `Никнейм: ${newNickname}`;
        profileMessage.textContent = 'Никнейм успешно обновлен!';
        
        hideEditProfile();
        loadLeaderboard(); 
    } catch (error) {
        console.error("Ошибка сохранения профиля:", error);
        profileMessage.textContent = `Ошибка сохранения: ${error.message}`;
    }
}

function hideEditProfile() {
    editProfileButton.style.display = 'block';
    editProfileForm.style.display = 'none';
}

function handleAuthToggle() {
    const isLogin = authToggleButton.textContent.includes('Регистрация');
    if (isLogin) {
        authToggleButton.textContent = 'Уже есть аккаунт? Вход';
        document.getElementById('auth-login-button').textContent = 'Регистрация';
    } else {
        authToggleButton.textContent = 'Нет аккаунта? Регистрация';
        document.getElementById('auth-login-button').textContent = 'Войти';
    }
}

async function handleAuthFormSubmit(event) {
    event.preventDefault();
    authMessage.textContent = '';

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const isLogin = authToggleButton.textContent.includes('Регистрация');
    
    try {
        if (isLogin) {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            const nickname = email.split('@')[0];
            await user.updateProfile({
                displayName: nickname
            });
            
            await db.collection("users").doc(user.uid).set({
                highScore: 0,
                email: email,
                nickname: nickname
            });

            authMessage.textContent = 'Регистрация прошла успешно!';
        }
    } catch (error) {
        console.error("Ошибка аутентификации:", error);
        authMessage.textContent = `Ошибка: ${error.message}`;
    }
}

function handleLogout() {
    auth.signOut();
    authModal.style.display = 'none';
    profileModal.style.display = 'none';
}


// --- ИНИЦИАЛИЗАЦИЯ AUTH ЛОГИКИ ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Обработчики аутентификации
    authToggleButton.onclick = handleAuthToggle;
    authForm.onsubmit = handleAuthFormSubmit;
    logoutButton.onclick = handleLogout;
    
    // Обработчики профиля
    editProfileButton.onclick = () => {
        editProfileButton.style.display = 'none';
        editProfileForm.style.display = 'block';
        const currentNicknameText = profileNicknameElement.textContent.replace('Никнейм:', '').trim();
        editNicknameInput.value = currentNicknameText; 
        profileMessage.textContent = '';
    };
    cancelEditButton.onclick = hideEditProfile;
    editProfileForm.onsubmit = handleProfileEdit;

    // Обработчики для закрытия модальных окон
    closeButtons.forEach(btn => {
        btn.onclick = (e) => {
            const modalType = e.target.dataset.modal;
            if (modalType === 'mode' && document.getElementById('mode-modal')) document.getElementById('mode-modal').style.display = 'none';
            if (modalType === 'auth') authModal.style.display = 'none';
            if (modalType === 'leaderboard') leaderboardModal.style.display = 'none';
            if (modalType === 'profile') profileModal.style.display = 'none';
        };
    });
    
    // Клик по профилю в панели входа
    authButton.onclick = () => {
        if (currentUser) {
            showProfileModal(currentUser.uid); 
        } else {
            authModal.style.display = 'block';
        }
    };
    
    // Кнопка "Топ 10"
    if (leaderboardButton) {
        leaderboardButton.onclick = () => {
            loadLeaderboard();
            leaderboardModal.style.display = 'block';
        };
    }
});
