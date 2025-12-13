// game.js

// --- КОНСТАНТЫ ИГРЫ ---
const BOARD_SIZE = 8;
const EMPTY_COLOR = '';
const NORMAL_MODE = 'normal';
const TRAINING_MODE = 'training';

// --- ИИ КОНСТАНТЫ ---
const AI_COMBO_WEIGHT = 10000;
const AI_OCCUPIED_PENALTY = 10;

// --- СОХРАНЕНИЕ СЕССИИ ---
const SESSION_KEY = 'blockBlastSession';
const HISTORY_KEY = 'gameHistory'; 
const MAX_HISTORY_GAMES = 3;

// --- ПЕРЕМЕННЫЕ СОСТОЯНИЯ (Game) ---
let board = [];
let score = 0;
let highScore = 0; 
let currentShapes = [];
let draggedShapeIndex = -1;
let dragOffset = { row: 0, col: 0 };
let gameMode = NORMAL_MODE;
let comboCount = 0; 
let hasClearedInCurrentSet = false; 
let currentBestPlacements = []; 
let isClearing = false; 
let totalLinesCleared = 0;

// Делаем переменные глобально доступными для auth.js
window.highScore = highScore;
window.updateHighScore = (newScore) => {
    // Эта функция будет переопределена в auth.js, если Firebase загружен
    // Временно сохраняем в LocalStorage
    localStorage.setItem('highScore', newScore.toString());
}; 
window.updateGameHistory = (history) => {
    // Эта функция будет переопределена в auth.js, если Firebase загружен
    // Временно сохраняем в LocalStorage
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}; 

// --- DOM ЭЛЕМЕНТЫ (Game) ---
const gameBoardElement = document.getElementById('game-board');
const scoreValueElement = document.getElementById('score-value');
const highScoreValueElement = document.getElementById('high-score-value');
const nextBlocksElement = document.getElementById('next-blocks');
const comboDisplay = document.getElementById('combo-display');
const modeInfoElement = document.getElementById('mode-info');
const newGameButton = document.getElementById('new-game-button');
const modeButton = document.getElementById('mode-button');
const modeModalElement = document.getElementById('mode-modal');
const modeSelectionButtons = document.querySelectorAll('.mode-selection-button');
const themeToggleButton = document.getElementById('theme-toggle-button');
const aiHintMessageElement = document.getElementById('ai-hint-message');

// --- ФИГУРЫ ---
const SHAPES = [
    { size: 1, color: '#feca57', pattern: [[1]] },
    { size: 2, color: '#feca57', pattern: [[1,1]] },
    { size: 2, color: '#feca57', pattern: [[1],[1]] },
    { size: 4, color: '#54a0ff', pattern: [[1,1],[1,1]] },
    { size: 3, color: '#1dd1a1', pattern: [[1,1,1]] },
    { size: 3, color: '#1dd1a1', pattern: [[1],[1],[1]] },
    { size: 4, color: '#ff6b6b', pattern: [[1,1,1,1]] },
    { size: 4, color: '#ff6b6b', pattern: [[1],[1],[1],[1]] },
    { size: 3, color: '#a29bfe', pattern: [[1,0],[1,1]] }, 
    { size: 3, color: '#a29bfe', pattern: [[0,1],[1,1]] },
    { size: 3, color: '#a29bfe', pattern: [[1,1],[1,0]] },
    { size: 3, color: '#a29bfe', pattern: [[1,1],[0,1]] },
    { size: 3, color: '#ff9f43', pattern: [[0,1,0],[1,1,1]] },
    { size: 5, color: '#1abc9c', pattern: [[1,0,0],[1,0,0],[1,1,1]] }, 
    { size: 5, color: '#1abc9c', pattern: [[1,1,1],[1,0,0],[1,0,0]] },
    { size: 5, color: '#9b59b6', pattern: [[1,1,1],[0,1,0],[0,1,0]] },
    { size: 9, color: '#f1c40f', pattern: [[1,1,1],[1,1,1],[1,1,1]] },
];

/**
 * Вспомогательная функция для получения экземпляра модального окна Bootstrap
 */
function getBootstrapModalInstance(element) {
    if (!element || typeof bootstrap === 'undefined') return { show: () => {}, hide: () => {} };
    let modalInstance = bootstrap.Modal.getInstance(element);
    if (!modalInstance) {
        modalInstance = new bootstrap.Modal(element);
    }
    return modalInstance;
}

// --- ФУНКЦИИ УПРАВЛЕНИЯ ИГРОЙ И СЕССИЕЙ ---

function updateModeInfo(mode) {
    if (mode === TRAINING_MODE) {
        modeInfoElement.textContent = "Режим: Тренировка (ИИ)"; 
        aiHintMessageElement.style.opacity = 1;
        aiHintMessageElement.textContent = ''; 
        if (currentShapes.some(s => s !== null)) {
            calculateBestMoves(); 
            highlightAIBestMoves();
        }
    } else {
        modeInfoElement.textContent = "Режим: Обычный";
        aiHintMessageElement.style.opacity = 0;
        aiHintMessageElement.textContent = '';
        clearHighlights();
    }
}

function initializeGame(mode) {
    clearGameSession(); 
    board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(EMPTY_COLOR));
    score = 0;
    comboCount = 0;
    hasClearedInCurrentSet = false; 
    gameMode = mode;
    currentBestPlacements = [];
    isClearing = false;
    totalLinesCleared = 0;
    
    // Обновляем High Score при инициализации, используя глобальный window.highScore
    window.highScore = parseInt(localStorage.getItem('highScore') || '0', 10);
    highScoreValueElement.textContent = window.highScore;

    scoreValueElement.textContent = score;
    comboDisplay.style.opacity = 0;
    
    updateModeInfo(mode);
    drawBoard();
    generateNextShapes(); 
    renderNextBlocks();
}

function saveGameSession() {
    if (gameMode !== NORMAL_MODE && gameMode !== TRAINING_MODE) return; 
    
    const sessionData = {
        board: board.map(row => [...row]), 
        score: score,
        comboCount: comboCount,
        hasClearedInCurrentSet: hasClearedInCurrentSet, 
        gameMode: gameMode,
        currentShapes: currentShapes.map(s => s ? { ...s, pattern: s.pattern.map(row => [...row]) } : null),
        totalLinesCleared: totalLinesCleared
    };
    
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
}

function clearGameSession() {
    localStorage.removeItem(SESSION_KEY);
}

function loadGameSession() {
    const sessionDataString = localStorage.getItem(SESSION_KEY);
    if (!sessionDataString) return false;
    
    try {
        const sessionData = JSON.parse(sessionDataString);
        
        board = sessionData.board;
        score = sessionData.score;
        comboCount = sessionData.comboCount;
        hasClearedInCurrentSet = sessionData.hasClearedInCurrentSet || false; 
        gameMode = sessionData.gameMode;
        totalLinesCleared = sessionData.totalLinesCleared || 0;
        
        currentShapes = sessionData.currentShapes.map(savedShape => {
            if (!savedShape) return null;
            // Поиск фигуры по паттерну/цвету
            return SHAPES.find(s => 
                s.color === savedShape.color && 
                JSON.stringify(s.pattern) === JSON.stringify(savedShape.pattern)
            ) || savedShape; 
        });
        
        scoreValueElement.textContent = score;
        updateModeInfo(gameMode);
        drawBoard();
        renderNextBlocks(); 
        
        return true;
    } catch (e) {
        console.error("Ошибка при загрузке сессии:", e);
        clearGameSession(); 
        return false;
    }
}

function saveGameHistory() {
    const historyEntry = {
        score: score,
        mode: gameMode === NORMAL_MODE ? 'Обычный' : 'Тренировка (ИИ)',
        lines: totalLinesCleared,
        date: new Date().toISOString()
    };

    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    
    history.unshift(historyEntry); 
    
    if (history.length > MAX_HISTORY_GAMES) {
        history = history.slice(0, MAX_HISTORY_GAMES);
    }
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

    if (window.updateGameHistory && window.currentUser) {
        window.updateGameHistory(history);
    }
}


// --- ФУНКЦИИ СЕТКИ И РИСОВАНИЯ ---

function drawBoard() {
    gameBoardElement.innerHTML = '';
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = r;
            cell.dataset.col = c;
            
            if (board[r][c] !== EMPTY_COLOR) {
                cell.classList.add('filled');
                cell.style.backgroundColor = board[r][c];
            }
            gameBoardElement.appendChild(cell);
        }
    }
}

function generateNextShapes() {
    currentShapes = [];
    for (let i = 0; i < 3; i++) {
        const randomIndex = Math.floor(Math.random() * SHAPES.length);
        currentShapes.push(SHAPES[randomIndex]);
    }
    if (gameMode === TRAINING_MODE) {
        calculateBestMoves(); 
    }
}

function createShapeElement(shapeData, index) {
    const shapeContainer = document.createElement('div');
    shapeContainer.classList.add('shape-container');
    shapeContainer.dataset.shapeIndex = index;
    
    if (shapeData) {
        shapeContainer.setAttribute('draggable', true);
        const shapeDiv = document.createElement('div');
        shapeDiv.classList.add('shape');
        shapeDiv.style.gridTemplateColumns = `repeat(${shapeData.pattern[0].length}, 1fr)`;
        
        shapeData.pattern.forEach(row => {
            row.forEach(cell => {
                const block = document.createElement('div');
                block.classList.add('block');
                if (cell === 1) {
                    block.style.backgroundColor = shapeData.color;
                    block.classList.add('filled');
                }
                shapeDiv.appendChild(block);
            });
        });
        shapeContainer.appendChild(shapeDiv);
    }
    return shapeContainer;
}

function renderNextBlocks() {
    if (isClearing) return; 

    nextBlocksElement.innerHTML = '';
    
    currentShapes.forEach((shapeData, index) => {
        const shapeContainer = createShapeElement(shapeData, index);
        nextBlocksElement.appendChild(shapeContainer);
        if (shapeData) {
            // Добавляем обработчики Drag & Drop
            shapeContainer.addEventListener('dragstart', handleDragStart);
            shapeContainer.addEventListener('dragend', handleDragEnd);
        }
    });
    
    clearHighlights();
    if (gameMode === TRAINING_MODE) {
        highlightAIBestMoves();
    }
}

// --- ЛОГИКА ИГРЫ ---

function canPlaceShape(pattern, startRow, startCol, currentBoard = board) {
    for (let r = 0; r < pattern.length; r++) {
        for (let c = 0; c < pattern[0].length; c++) {
            if (pattern[r][c] === 1) {
                const boardR = startRow + r;
                const boardC = startCol + c;
                
                if (boardR < 0 || boardR >= BOARD_SIZE || boardC < 0 || boardC >= BOARD_SIZE) {
                    return false;
                }
                if (currentBoard[boardR][boardC] !== EMPTY_COLOR) {
                    return false; 
                }
            }
        }
    }
    return true;
}

function placeShape(shapeData, startRow, startCol) {
    if (isClearing) return false; 
    
    const pattern = shapeData.pattern;
    
    if (!canPlaceShape(pattern, startRow, startCol)) {
        return false;
    }

    // 1. Размещаем фигуру
    for (let r = 0; r < pattern.length; r++) {
        for (let c = 0; c < pattern[0].length; c++) {
            if (pattern[r][c] === 1) {
                board[startRow + r][startCol + c] = shapeData.color;
            }
        }
    }
    
    // 2. Начисляем очки за фигуру
    score += shapeData.size;
    scoreValueElement.textContent = score;
    
    // 3. Помечаем фигуру как использованную
    currentShapes[draggedShapeIndex] = null;
    
    // 4. Обновляем отображение доски 
    drawBoard();
    
    // 5. НЕМЕДЛЕННАЯ ОЧИСТКА
    const clearAnimationStarted = executeClearsAndScoring(); 
    
    const remainingShapesCount = currentShapes.filter(s => s !== null).length;
    const isSetComplete = (remainingShapesCount === 0);

    if (isSetComplete) {
        
        if (!hasClearedInCurrentSet) {
             comboCount = 0;
             comboDisplay.style.opacity = 0;
        }
        
        hasClearedInCurrentSet = false; 
        generateNextShapes(); 
    } 
    
    if (!clearAnimationStarted) {
        if (gameMode === TRAINING_MODE) {
            calculateBestMoves();
        }
        renderNextBlocks(); 
        checkGameOver(); 
    }
    
    saveGameSession(); 
    
    return true;
}

function checkClears(currentBoard) {
    let clearedLines = 0;
    let cellsToClear = new Set();
    
    // Проверка рядов
    for (let r = 0; r < BOARD_SIZE; r++) {
        let isRowFull = true;
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (currentBoard[r][c] === EMPTY_COLOR) {
                isRowFull = false;
                break;
            }
        }
        if (isRowFull) {
            clearedLines++;
            for (let c = 0; c < BOARD_SIZE; c++) cellsToClear.add(`${r}-${c}`);
        }
    }

    // Проверка колонок
    for (let c = 0; c < BOARD_SIZE; c++) {
        let isColFull = true;
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (currentBoard[r][c] === EMPTY_COLOR) {
                isColFull = false;
                break;
            }
        }
        if (isColFull) {
            clearedLines++;
            for (let r = 0; r < BOARD_SIZE; r++) cellsToClear.add(`${r}-${c}`);
        }
    }
    
    return { clearedLines, cellsToClear };
}

function executeClearsAndScoring() {
    const { clearedLines, cellsToClear } = checkClears(board);
    
    if (clearedLines > 0) {
        isClearing = true;
        
        hasClearedInCurrentSet = true; 
        
        totalLinesCleared += clearedLines; 
        
        comboCount++; 
        
        let baseScore = cellsToClear.size * 10; 
        let bonusScore = baseScore + (clearedLines * comboCount * 100); 
        
        comboDisplay.textContent = comboCount > 1 
            ? `КОМБО x${comboCount}! (+${bonusScore} очков)` 
            : `+${bonusScore} очков за ${clearedLines} линий!`;
            
        comboDisplay.style.opacity = 1;
        
        score += bonusScore;
        scoreValueElement.textContent = score;

        // Анимация очистки (добавление класса 'clearing')
        cellsToClear.forEach(key => {
            const [r, c] = key.split('-').map(Number);
            const cell = gameBoardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`);
            if (cell) {
                cell.classList.add('clearing');
            }
        });

        // Отложенное фактическое удаление и обновление состояния
        setTimeout(() => {
            cellsToClear.forEach(key => {
                const [r, c] = key.split('-').map(Number);
                board[r][c] = EMPTY_COLOR;
            });
            
            drawBoard(); 
            isClearing = false;
            
            if (gameMode === TRAINING_MODE) {
                calculateBestMoves();
            }
            renderNextBlocks(); 
            checkGameOver();
            
        }, 400); 
        
        return true; 
    } else {
        return false; 
    }
}

function checkGameOver() {
    const remainingShapes = currentShapes.filter(s => s !== null);
    
    if (remainingShapes.length > 0) {
        let canPlaceAny = false;
        for (const shapeData of remainingShapes) {
            if (shapeData) {
                for (let r = 0; r < BOARD_SIZE; r++) {
                    for (let c = 0; c < BOARD_SIZE; c++) {
                        if (canPlaceShape(shapeData.pattern, r, c)) {
                            canPlaceAny = true;
                            break;
                        }
                    }
                    if (canPlaceAny) break;
                }
            }
            if (canPlaceAny) break;
        }
        
        if (!canPlaceAny) {
            endGame();
        }
    }
}

function endGame() {
    // 1. Сохраняем историю игры
    saveGameHistory();

    // 2. Обновляем рекорд ТОЛЬКО в Обычном режиме 
    if (gameMode === NORMAL_MODE) {
        if (score > window.highScore) {
            window.highScore = score;
            highScoreValueElement.textContent = window.highScore;
            
            // Сохранение рекорда (используем глобальную функцию)
            if (typeof window.updateHighScore === 'function') {
                window.updateHighScore(window.highScore);
            }
        }
    }
    
    clearGameSession();
    
    setTimeout(() => {
        let message = `Игра окончена! Ваш финальный счет: ${score}`;
        if (gameMode === TRAINING_MODE) {
            message += ' (Рекорд не засчитан в режиме Тренировки)';
        }
        message += `\nОчищено линий: ${totalLinesCleared}`; 
        
        alert(message);
        initializeGame(gameMode); 
    }, 500);
}

// --- ФУНКЦИИ ИИ (AI) ---

function calculateHeuristicScore(boardState, shapeData, startRow, startCol) {
    const pattern = shapeData.pattern;
    
    if (!canPlaceShape(pattern, startRow, startCol, boardState)) { 
           return -Infinity; 
    }
    
    let tempCells = boardState.map(row => [...row]); 

    for (let r = 0; r < pattern.length; r++) {
        for (let c = 0; c < pattern[0].length; c++) {
            if (pattern[r][c] === 1) {
                tempCells[startRow + r][startCol + c] = 'temp'; 
            }
        }
    }

    const { clearedLines } = checkClears(tempCells); 

    let currentScore = 0;
    
    if (clearedLines > 0) {
        currentScore += clearedLines * clearedLines * AI_COMBO_WEIGHT; 
    }
    
    currentScore += shapeData.size;
    
    let occupiedCells = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (tempCells[r][c] !== EMPTY_COLOR) {
                occupiedCells++;
            }
        }
    }
    currentScore -= occupiedCells * AI_OCCUPIED_PENALTY; 

    return currentScore;
}

function calculateBestMoves() {
    currentBestPlacements = [];
    
    currentShapes.forEach((shapeData, shapeIndex) => {
        if (!shapeData) {
            currentBestPlacements[shapeIndex] = null;
            return;
        }
        
        let bestScore = -Infinity;
        let bestPlacement = null;
        
        for (let r = 0; r <= BOARD_SIZE - shapeData.pattern.length; r++) {
            for (let c = 0; c <= BOARD_SIZE - shapeData.pattern[0].length; c++) {
                
                const currentScore = calculateHeuristicScore(board, shapeData, r, c);
                
                if (currentScore > bestScore) {
                    bestScore = currentScore;
                    bestPlacement = { startR: r, startC: c, score: bestScore, shapeIndex: shapeIndex };
                }
            }
        }
        
        if (bestPlacement && bestPlacement.score > -Infinity) {
            currentBestPlacements[shapeIndex] = bestPlacement;
        } else {
            currentBestPlacements[shapeIndex] = null; 
        }
    });
}

function clearHighlights() {
    document.querySelectorAll('.cell').forEach(cell => {
        cell.classList.remove('ai-highlight-0', 'ai-highlight-1', 'ai-highlight-2');
    });
    document.querySelectorAll('.shape-container').forEach(container => {
        container.classList.remove('ai-target-0', 'ai-target-1', 'ai-target-2');
    });
    if (aiHintMessageElement) aiHintMessageElement.textContent = '';
}

function highlightAI(placement, shapeData, index) {
    const { startR, startC } = placement;
    const pattern = shapeData.pattern;
    const colorClass = `ai-highlight-${index}`; 
    const targetClass = `ai-target-${index}`;
    
    const shapeContainer = document.querySelector(`.shape-container[data-shape-index="${index}"]`);
    if (shapeContainer) {
        shapeContainer.classList.add(targetClass);
    }
    
    for (let r = 0; r < pattern.length; r++) {
        for (let c = 0; c < pattern[0].length; c++) {
            if (pattern[r][c] === 1) {
                const boardR = startR + r;
                const boardC = startC + c;
                const cell = gameBoardElement.querySelector(`[data-row="${boardR}"][data-col="${boardC}"]`);
                if (cell) {
                    cell.classList.add(colorClass); 
                }
            }
        }
    }
}

function highlightAIBestMoves() {
    if (gameMode !== TRAINING_MODE) return;
    
    clearHighlights();
    let validPlacements = currentBestPlacements.filter(p => p !== null);
    
    if (validPlacements.length === 0) {
        if (aiHintMessageElement) aiHintMessageElement.textContent = '⛔ Нет возможных ходов.'; 
        return;
    }
    
    let bestOverallScore = -Infinity;
    
    validPlacements.forEach(p => {
        if (p.score > bestOverallScore) {
            bestOverallScore = p.score;
        }
    });
    
    // Подсвечиваем только те ходы, чей счет близок к абсолютному лучшему (порог 95%)
    validPlacements.forEach(p => {
        if (p.score >= bestOverallScore * 0.95) { 
             highlightAI(p, currentShapes[p.shapeIndex], p.shapeIndex); 
        }
    });
    
    if (aiHintMessageElement) {
        aiHintMessageElement.textContent = 'Подсвечены лучшие ходы ИИ.'; 
    }
}

// --- DRAG & DROP ФУНКЦИИ ---

function handleDragStart(event) {
    if (isClearing) {
        event.preventDefault();
        return;
    }
    const shapeContainer = event.currentTarget;
    draggedShapeIndex = parseInt(shapeContainer.dataset.shapeIndex);
    
    shapeContainer.classList.add('is-dragging');
    event.dataTransfer.setData('text/plain', draggedShapeIndex);
    
    const shapeRect = shapeContainer.getBoundingClientRect();
    const x = event.clientX - shapeRect.left;
    const y = event.clientY - shapeRect.top;
    
    const shapeData = currentShapes[draggedShapeIndex];
    if (!shapeData) return;
    const pattern = shapeData.pattern;
    
    // Вычисляем размеры блока на основе размеров контейнера
    const blockWidth = shapeRect.width / pattern[0].length;
    const blockHeight = shapeRect.height / pattern.length;
    
    let clickedRow = 0;
    let clickedCol = 0;
    
    // Находим блок, на который кликнули
    for (let r = 0; r < pattern.length; r++) {
        for (let c = 0; c < pattern[0].length; c++) {
            if (pattern[r][c] === 1) {
                if (x >= c * blockWidth && x < (c + 1) * blockWidth &&
                    y >= r * blockHeight && y < (r + 1) * blockHeight) {
                    clickedRow = r;
                    clickedCol = c;
                    r = pattern.length; 
                    break;
                }
            }
        }
    }

    dragOffset = { row: clickedRow, col: clickedCol };
    
    // Устанавливаем Drag Image
    const dragImage = shapeContainer.cloneNode(true);
    dragImage.style.opacity = '0.7';
    dragImage.style.position = 'absolute';
    dragImage.style.left = '-1000px'; 
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, x, y);

    setTimeout(() => document.body.removeChild(dragImage), 0);
    
    if (gameMode === TRAINING_MODE) {
        clearHighlights();
    }
}

function handleDragEnd(event) {
    const shapeContainer = event.currentTarget;
    shapeContainer.classList.remove('is-dragging');
    draggedShapeIndex = -1;
    
    // Очистка предварительного размещения
    document.querySelectorAll('.potential-placement').forEach(cell => {
        cell.classList.remove('potential-placement');
        cell.style.backgroundColor = ''; 
    });

    if (gameMode === TRAINING_MODE) {
        highlightAIBestMoves(); 
    }
}

function handleDragOver(event) {
    event.preventDefault(); 
    const targetCell = event.target.closest('.cell');
    if (!targetCell || draggedShapeIndex === -1 || isClearing) return;
    
    // Очистка предыдущей подсветки
    document.querySelectorAll('.potential-placement').forEach(cell => {
        cell.classList.remove('potential-placement');
        if (!cell.classList.contains('filled')) {
             cell.style.backgroundColor = '';
        }
    });

    const cellRow = parseInt(targetCell.dataset.row);
    const cellCol = parseInt(targetCell.dataset.col);
    const startRow = cellRow - dragOffset.row;
    const startCol = cellCol - dragOffset.col;
    const shapeData = currentShapes[draggedShapeIndex];
    
    if (!shapeData) return;

    if (canPlaceShape(shapeData.pattern, startRow, startCol)) {
        for (let r = 0; r < shapeData.pattern.length; r++) {
            for (let c = 0; c < shapeData.pattern[0].length; c++) {
                if (shapeData.pattern[r][c] === 1) {
                    const boardR = startRow + r;
                    const boardC = startCol + c;
                    const cell = gameBoardElement.querySelector(`[data-row="${boardR}"][data-col="${boardC}"]`);
                    if (cell) {
                        cell.classList.add('potential-placement');
                        cell.style.backgroundColor = shapeData.color;
                    }
                }
            }
        }
    }
}

function handleDrop(event) {
    event.preventDefault();
    const targetCell = event.target.closest('.cell');
    
    // Очистка предварительного размещения (даже если drop неудачный)
    document.querySelectorAll('.potential-placement').forEach(cell => {
        cell.classList.remove('potential-placement');
        cell.style.backgroundColor = ''; 
    });

    if (!targetCell || draggedShapeIndex === -1 || isClearing) return;

    const cellRow = parseInt(targetCell.dataset.row);
    const cellCol = parseInt(targetCell.dataset.col);
    const startRow = cellRow - dragOffset.row;
    const startCol = cellCol - dragOffset.col;
    
    const shapeData = currentShapes[draggedShapeIndex];
    if (!shapeData) return;
    
    placeShape(shapeData, startRow, startCol);
}


// --- ФУНКЦИИ UI/НАСТРОЕК ---

function selectMode(mode) {
    const modalInstance = getBootstrapModalInstance(modeModalElement);
    modalInstance.hide(); // Закрываем модальное окно через Bootstrap JS
    
    if (mode !== gameMode) {
        if (confirm(`Вы действительно хотите изменить режим на "${mode}"? Ваша текущая игра будет сброшена.`)) {
             initializeGame(mode);
        }
    }
    
    modeSelectionButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === gameMode) {
            btn.classList.add('active');
        }
    });
}

function updateThemeButton(isDarkMode) {
    themeToggleButton.textContent = isDarkMode ? 'Светлая тема' : 'Темная тема';
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    updateThemeButton(isDarkMode);
}


// --- ИНИЦИАЛИЗАЦИЯ ИГРЫ ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Инициализация Drag & Drop на доске
    gameBoardElement.addEventListener('dragover', handleDragOver);
    gameBoardElement.addEventListener('drop', handleDrop);
    
    newGameButton.onclick = () => {
        if (confirm('Начать новую игру? Текущий прогресс будет потерян.')) {
            initializeGame(gameMode);
        }
    };

    // Обработчик кнопки Режим (использует модальное окно Bootstrap)
    // bootstrap.bundle.min.js автоматически обрабатывает открытие модального окна, 
    // если на кнопке есть data-bs-toggle="modal" и data-bs-target="#mode-modal".

    modeSelectionButtons.forEach(btn => {
        btn.onclick = (e) => selectMode(e.currentTarget.dataset.mode);
    });
    
    const isDarkMode = localStorage.getItem('theme') === 'dark';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
    }
    updateThemeButton(isDarkMode); 
    
    if (themeToggleButton) {
        themeToggleButton.onclick = toggleTheme;
    }
    
    // Устанавливаем начальный high score, который может быть перезаписан auth.js
    window.highScore = parseInt(localStorage.getItem('highScore') || '0', 10);
    highScoreValueElement.textContent = window.highScore;

    if (!loadGameSession()) {
        initializeGame(NORMAL_MODE);
    }
});
