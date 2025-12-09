// game.js

// --- КОНСТАНТЫ ИГРЫ ---
const BOARD_SIZE = 8;
const EMPTY_COLOR = '';
const NORMAL_MODE = 'normal';
const TRAINING_MODE = 'training';

// --- ИИ КОНСТАНТЫ ---
const AI_COMBO_WEIGHT = 5000; 
const AI_OCCUPIED_PENALTY = 5;

// --- СОХРАНЕНИЕ СЕССИИ ---
const SESSION_KEY = 'blockBlastSession';

// --- ПЕРЕМЕННЫЕ СОСТОЯНИЯ (Game) ---
let board = [];
let score = 0;
let highScore = 0; // Должен быть глобально доступен для auth.js
let currentShapes = [];
let draggedShapeIndex = -1;
let dragOffset = { row: 0, col: 0 };
let gameMode = NORMAL_MODE;
let comboCount = 0;
let currentBestPlacements = []; 

// Делаем переменные глобально доступными для auth.js (для чтения/записи)
window.highScore = highScore;
window.updateHighScore = null; // Будет заполнено в auth.js

// --- DOM ЭЛЕМЕНТЫ (Game) ---
const gameBoardElement = document.getElementById('game-board');
const scoreValueElement = document.getElementById('score-value');
const highScoreValueElement = document.getElementById('high-score-value');
const nextBlocksElement = document.getElementById('next-blocks');
const comboDisplay = document.getElementById('combo-display');
const modeInfoElement = document.getElementById('mode-info');
const newGameButton = document.getElementById('new-game-button');
const modeButton = document.getElementById('mode-button');
const modeModal = document.getElementById('mode-modal');
const modeSelectionButtons = document.querySelectorAll('.mode-selection-button');
const themeToggleButton = document.getElementById('theme-toggle-button');

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

// --- ФУНКЦИИ УПРАВЛЕНИЯ ИГРОЙ И СЕССИЕЙ ---

function updateModeInfo(mode) {
    if (mode === TRAINING_MODE) {
        modeInfoElement.textContent = "Режим: Тренировка (ИИ подсказывает лучший ход)";
        document.getElementById('ai-hint-message').style.opacity = 1;
    } else {
        modeInfoElement.textContent = "Режим: Обычный";
        document.getElementById('ai-hint-message').style.opacity = 0;
    }
}

function initializeGame(mode) {
    clearGameSession(); 
    board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(EMPTY_COLOR));
    score = 0;
    comboCount = 0;
    gameMode = mode;
    currentBestPlacements = [];
    
    scoreValueElement.textContent = score;
    comboDisplay.style.opacity = 0;
    
    updateModeInfo(mode);
    drawBoard();
    generateNextShapes();
    renderNextBlocks();
    clearHighlights();
}

// --- ФУНКЦИИ СОХРАНЕНИЯ/ЗАГРУЗКИ СЕССИИ (LocalStorage) ---

function saveGameSession() {
    if (gameMode !== NORMAL_MODE && gameMode !== TRAINING_MODE) return; 
    
    const sessionData = {
        board: board.map(row => [...row]), 
        score: score,
        comboCount: comboCount,
        gameMode: gameMode,
        currentShapes: currentShapes.map(s => s ? { ...s, pattern: s.pattern.map(row => [...row]) } : null) 
    };
    
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    console.log("Состояние игры сохранено.");
}

function clearGameSession() {
    localStorage.removeItem(SESSION_KEY);
    console.log("Состояние игры очищено.");
}

function loadGameSession() {
    const sessionDataString = localStorage.getItem(SESSION_KEY);
    if (!sessionDataString) return false;
    
    try {
        const sessionData = JSON.parse(sessionDataString);
        
        board = sessionData.board;
        score = sessionData.score;
        comboCount = sessionData.comboCount;
        gameMode = sessionData.gameMode;
        
        currentShapes = sessionData.currentShapes.map(savedShape => {
            if (!savedShape) return null;
            return SHAPES.find(s => 
                s.size === savedShape.size && 
                s.color === savedShape.color && 
                JSON.stringify(s.pattern) === JSON.stringify(savedShape.pattern)
            ) || savedShape; 
        });
        
        scoreValueElement.textContent = score;
        updateModeInfo(gameMode);
        drawBoard();
        renderNextBlocks();
        
        console.log("Состояние игры загружено.");
        return true;
    } catch (e) {
        console.error("Ошибка при загрузке сессии:", e);
        clearGameSession(); 
        return false;
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
    const allShapesUsed = currentShapes.every(s => s === null);
    
    if (allShapesUsed) {
        generateNextShapes(); 
    }

    nextBlocksElement.innerHTML = '';
    
    currentShapes.forEach((shapeData, index) => {
        const shapeContainer = createShapeElement(shapeData, index);
        nextBlocksElement.appendChild(shapeContainer);
        if (shapeData) {
            shapeContainer.addEventListener('dragstart', handleDragStart);
            shapeContainer.addEventListener('dragend', handleDragEnd);
        }
    });
    
    if (allShapesUsed) { 
         checkGameOver(); 
    }

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
    const pattern = shapeData.pattern;
    
    if (!canPlaceShape(pattern, startRow, startCol)) {
        return false;
    }

    for (let r = 0; r < pattern.length; r++) {
        for (let c = 0; c < pattern[0].length; c++) {
            if (pattern[r][c] === 1) {
                board[startRow + r][startCol + c] = shapeData.color;
            }
        }
    }
    
    score += shapeData.size;
    scoreValueElement.textContent = score;
    drawBoard();
    
    currentShapes[draggedShapeIndex] = null;
    
    renderNextBlocks();
    checkClearsAndUpdateScore();
    
    saveGameSession(); 
    
    return true;
}

function checkClears(currentBoard) {
    let clearedLines = 0;
    let cellsToClear = new Set();
    
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

function checkClearsAndUpdateScore() {
    const { clearedLines, cellsToClear } = checkClears(board);
    
    if (clearedLines > 0) {
        if (clearedLines > 1) {
            comboCount++;
        } else {
            comboCount = 0;
        }
        
        let bonusScore = 0;
        if (comboCount > 0) {
            bonusScore = clearedLines * clearedLines * 100 * comboCount; 
            comboDisplay.textContent = `КОМБО x${comboCount}! (+${bonusScore} очков)`;
            comboDisplay.style.opacity = 1;
        } else {
            bonusScore = clearedLines * 100;
            comboDisplay.textContent = `+${bonusScore} очков за ${clearedLines} линий!`;
            comboDisplay.style.opacity = 1;
        }
        
        score += bonusScore;
        scoreValueElement.textContent = score;

        cellsToClear.forEach(key => {
            const [r, c] = key.split('-').map(Number);
            const cell = gameBoardElement.querySelector(`[data-row="${r}"][data-col="${c}"]`);
            if (cell) {
                cell.classList.add('clearing');
            }
        });

        setTimeout(() => {
            cellsToClear.forEach(key => {
                const [r, c] = key.split('-').map(Number);
                board[r][c] = EMPTY_COLOR;
            });
            
            drawBoard();
            
            if (gameMode === TRAINING_MODE) {
                 calculateBestMoves();
                 highlightAIBestMoves();
            }
            
        }, 400); 
    } else {
        comboCount = 0;
        comboDisplay.style.opacity = 0;
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
    if (score > window.highScore) {
        window.highScore = score;
        highScoreValueElement.textContent = window.highScore;
        
        // Вызов функции из auth.js
        if (typeof window.updateHighScore === 'function' && window.currentUser) {
            window.updateHighScore(window.highScore);
        }
    }
    
    setTimeout(() => {
        alert(`Игра окончена! Ваш финальный счет: ${score}`);
        initializeGame(gameMode); 
    }, 500);
}

// --- ФУНКЦИИ ИИ (AI) ---

function calculateHeuristicScore(boardState, shapeData, startRow, startCol) {
    const pattern = shapeData.pattern;
    let tempCells = boardState.map(row => [...row]); 

    if (!canPlaceShape(pattern, startRow, startCol, tempCells)) {
         return -Infinity; 
    }

    for (let r = 0; r < pattern.length; r++) {
        for (let c = 0; c < pattern[0].length; c++) {
            if (pattern[r][c] === 1) {
                tempCells[startRow + r][startCol + c] = shapeData.color;
            }
        }
    }

    const { clearedLines } = checkClears(tempCells); 

    let score = 0;
    
    if (clearedLines > 0) {
        score += clearedLines * clearedLines * AI_COMBO_WEIGHT; 
    }
    
    let occupiedCells = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (tempCells[r][c] !== EMPTY_COLOR) {
                occupiedCells++;
            }
        }
    }
    score -= occupiedCells * AI_OCCUPIED_PENALTY; 

    return score;
}

function calculateBestMoves() {
    currentBestPlacements = [];
    
    currentShapes.forEach((shapeData, shapeIndex) => {
        if (!shapeData) return;
        
        let bestScore = -Infinity;
        let bestPlacement = null;
        
        for (let r = 0; r <= BOARD_SIZE - shapeData.pattern.length; r++) {
            for (let c = 0; c <= BOARD_SIZE - shapeData.pattern[0].length; c++) {
                
                const currentScore = calculateHeuristicScore(board, shapeData, r, c);
                
                if (currentScore > bestScore) {
                    bestScore = currentScore;
                    bestPlacement = { startR: r, startC: c, score: bestScore };
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
    const hintMessage = document.getElementById('ai-hint-message');
    if (hintMessage) hintMessage.textContent = '';
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
    clearHighlights();
    let hasValidMove = false;
    
    let bestOverallScore = -Infinity;
    let bestOverallShapeIndex = -1;
    
    currentBestPlacements.forEach((placement, index) => {
        if (placement && placement.score > bestOverallScore) {
            bestOverallScore = placement.score;
            bestOverallShapeIndex = index;
        }
    });

    const hintMessage = document.getElementById('ai-hint-message');

    if (bestOverallShapeIndex !== -1 && bestOverallScore > -Infinity) {
        const placement = currentBestPlacements[bestOverallShapeIndex];
        const shapeData = currentShapes[bestOverallShapeIndex];
        highlightAI(placement, shapeData, bestOverallShapeIndex);
        if (hintMessage) hintMessage.textContent = "Подсказка ИИ: Используй подсвеченную фигуру в подсвеченной области!";
        hasValidMove = true;
    }
    
    if (!hasValidMove && hintMessage) {
         hintMessage.textContent = "ИИ не нашел подходящего хода. Скоро конец игры.";
    }
}

// --- DRAG & DROP ФУНКЦИИ ---

function handleDragStart(event) {
    const shapeContainer = event.currentTarget;
    draggedShapeIndex = parseInt(shapeContainer.dataset.shapeIndex);
    
    shapeContainer.classList.add('is-dragging');
    event.dataTransfer.setData('text/plain', draggedShapeIndex);
    
    const shapeRect = shapeContainer.getBoundingClientRect();
    const x = event.clientX - shapeRect.left;
    const y = event.clientY - shapeRect.top;
    
    const shapeData = currentShapes[draggedShapeIndex];
    if (!shapeData) return;
    const blockWidth = shapeRect.width / shapeData.pattern[0].length;
    const blockHeight = shapeRect.height / shapeData.pattern.length;
    
    let clickedRow = 0;
    let clickedCol = 0;
    const pattern = shapeData.pattern;
    
    for (let r = 0; r < pattern.length; r++) {
        for (let c = 0; c < pattern[0].length; c++) {
            if (pattern[r][c] === 1) {
                if (x >= c * blockWidth && x < (c + 1) * blockWidth &&
                    y >= r * blockHeight && y < (r + 1) * blockHeight) {
                    clickedRow = r;
                    clickedCol = c;
                    break;
                }
            }
        }
        if (clickedRow !== 0 || clickedCol !== 0) break;
    }

    dragOffset = { row: clickedRow, col: clickedCol };
    
    const dragImage = shapeContainer.cloneNode(true);
    dragImage.style.opacity = '0.5';
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
    if (!targetCell || draggedShapeIndex === -1) return;
    
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
    
    document.querySelectorAll('.potential-placement').forEach(cell => {
        cell.classList.remove('potential-placement');
        cell.style.backgroundColor = ''; 
    });

    if (!targetCell || draggedShapeIndex === -1) return;

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
    modeModal.style.display = 'none';
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
    // Установка обработчиков Drag & Drop на саму доску
    gameBoardElement.addEventListener('dragover', handleDragOver);
    gameBoardElement.addEventListener('drop', handleDrop);
    
    // Кнопка "Новая игра"
    newGameButton.onclick = () => {
        if (confirm('Начать новую игру? Текущий прогресс будет потерян.')) {
            initializeGame(gameMode);
        }
    };

    // Кнопка "Режим"
    modeButton.onclick = () => {
        modeModal.style.display = 'block';
        modeSelectionButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === gameMode) {
                btn.classList.add('active');
            }
        });
    };
    
    // Обработчики для выбора режима
    modeSelectionButtons.forEach(btn => {
        btn.onclick = (e) => selectMode(e.currentTarget.dataset.mode);
    });
    
    // Инициализация темной темы
    const isDarkMode = localStorage.getItem('theme') === 'dark';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
    }
    updateThemeButton(isDarkMode); 
    
    if (themeToggleButton) {
        themeToggleButton.onclick = toggleTheme;
    }
    
    // Загрузка игры
    if (!loadGameSession()) {
        initializeGame(NORMAL_MODE);
    }
});
