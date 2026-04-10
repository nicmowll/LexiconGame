// ===== LEXICON — Daily Vocab Challenge =====

(function () {
  'use strict';

  // ===== DOM Elements =====
  const $ = (sel) => document.querySelector(sel);
  const puzzleNumberEl = $('#puzzleNumber');
  const puzzleDateEl = $('#puzzleDate');
  const definitionTextEl = $('#definitionText');
  const wordTypeEl = $('#wordType');
  const letterCountEl = $('#letterCount');
  const letterBlanksEl = $('#letterBlanks');
  const letterHintBtn = $('#letterHintBtn');
  const wordOriginEl = $('#wordOrigin');
  const submitBtn = $('#submitBtn');
  const guessHistoryEl = $('#guessHistory');
  const resultSection = $('#resultSection');
  const resultEmoji = $('#resultEmoji');
  const resultTitle = $('#resultTitle');
  const resultWord = $('#resultWord');
  const statGuesses = $('#statGuesses');
  const shareBtn = $('#shareBtn');
  const countdownEl = $('#countdown');
  const helpBtn = $('#helpBtn');
  const helpModal = $('#helpModal');
  const helpClose = $('#helpClose');
  const statsBtn = $('#statsBtn');
  const statsModal = $('#statsModal');
  const statsClose = $('#statsClose');

  // ===== Game State =====
  let state = {
    todayKey: '',
    wordIndex: -1,
    word: null,
    guesses: [],
    hintsUsed: 0,
    originRevealed: false,
    revealedLetters: [],  // indices of revealed letters
    solved: false,
  };

  // ===== Utility: Get today's date key =====
  function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // ===== Utility: Deterministic daily word index =====
  function getDailyWordIndex(dateKey) {
    // Simple hash from date string to get a consistent index
    let hash = 0;
    for (let i = 0; i < dateKey.length; i++) {
      hash = ((hash << 5) - hash) + dateKey.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % WORDS.length;
  }

  // ===== Utility: Get puzzle number (days since epoch) =====
  function getPuzzleNumber(dateKey) {
    const epoch = new Date('2025-01-01');
    const today = new Date(dateKey);
    return Math.floor((today - epoch) / (1000 * 60 * 60 * 24)) + 1;
  }

  // ===== Utility: Format date =====
  function formatDate(dateKey) {
    const d = new Date(dateKey + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  // ===== Local Storage =====
  function saveState() {
    if (testMode) return; // Don't persist test mode games
    localStorage.setItem('lexicon_state', JSON.stringify(state));
  }

  function loadState() {
    try {
      const saved = localStorage.getItem('lexicon_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.todayKey === getTodayKey()) {
          state = parsed;
          return true;
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function loadStats() {
    try {
      const saved = localStorage.getItem('lexicon_stats');
      return saved ? JSON.parse(saved) : { played: 0, wins: 0, currentStreak: 0, bestStreak: 0 };
    } catch (e) {
      return { played: 0, wins: 0, currentStreak: 0, bestStreak: 0 };
    }
  }

  function saveStats(stats) {
    localStorage.setItem('lexicon_stats', JSON.stringify(stats));
  }

  // ===== Initialize Game =====
  function init() {
    const todayKey = getTodayKey();
    const resumed = loadState();

    if (!resumed) {
      const wordIndex = getDailyWordIndex(todayKey);
      state = {
        todayKey,
        wordIndex,
        word: WORDS[wordIndex],
        guesses: [],
        hintsUsed: 0,
        originRevealed: false,
        revealedLetters: [],
        solved: false,
      };
      saveState();
    } else {
      // Restore the word object from index in case WORDS changed
      state.word = WORDS[state.wordIndex];
    }

    renderPuzzleInfo();
    renderDefinition();
    renderBlanks();
    renderGuessHistory();

    if (state.solved) {
      showResult(false);
    } else {
      setTimeout(() => focusFirstEmpty(), 50);
    }

    updateHintButtons();
    startCountdown();

    // Show help on first visit
    if (!localStorage.getItem('lexicon_visited')) {
      helpModal.hidden = false;
      localStorage.setItem('lexicon_visited', 'true');
    }
  }

  // ===== Render Functions =====
  function renderPuzzleInfo() {
    puzzleNumberEl.textContent = `#${getPuzzleNumber(state.todayKey)}`;
    puzzleDateEl.textContent = formatDate(state.todayKey);
  }

  function renderDefinition() {
    definitionTextEl.textContent = `"${state.word.definition}"`;
    wordTypeEl.textContent = state.word.type;
    letterCountEl.textContent = `${state.word.word.length} letters`;
    wordOriginEl.textContent = state.word.origin;
  }

  function renderBlanks() {
    letterBlanksEl.innerHTML = '';
    const word = state.word.word;

    for (let i = 0; i < word.length; i++) {
      const box = document.createElement('input');
      box.type = 'text';
      box.maxLength = 1;
      box.className = 'letter-box';
      box.dataset.index = i;
      box.setAttribute('autocomplete', 'off');
      box.setAttribute('autocapitalize', 'characters');
      box.setAttribute('autocorrect', 'off');
      box.setAttribute('spellcheck', 'false');
      box.setAttribute('inputmode', 'text');
      box.setAttribute('enterkeyhint', 'done');

      if (state.solved) {
        box.value = word[i];
        box.classList.add('solved');
        box.readOnly = true;
      } else if (state.revealedLetters.includes(i)) {
        box.value = word[i];
        box.classList.add('revealed');
        box.readOnly = true;
        box.tabIndex = -1;
      } else {
        // Restore user-typed letters if any
        if (state.typedLetters && state.typedLetters[i]) {
          box.value = state.typedLetters[i];
          box.classList.add('typed');
        }
      }

      letterBlanksEl.appendChild(box);
    }

    if (!state.solved) {
      attachBoxListeners();
    }
  }

  // ===== Letter Box Interaction =====
  function getBoxes() {
    return Array.from(letterBlanksEl.querySelectorAll('.letter-box'));
  }

  function getEditableIndices() {
    // Indices of boxes that are NOT revealed (user can type in them)
    const word = state.word.word;
    const indices = [];
    for (let i = 0; i < word.length; i++) {
      if (!state.revealedLetters.includes(i)) {
        indices.push(i);
      }
    }
    return indices;
  }

  function focusNextEditable(currentIndex, forward) {
    const editable = getEditableIndices();
    if (editable.length === 0) return;

    const currentPos = editable.indexOf(currentIndex);
    let nextPos;
    if (forward) {
      nextPos = currentPos + 1;
      if (nextPos >= editable.length) return; // at the end
    } else {
      nextPos = currentPos - 1;
      if (nextPos < 0) return; // at the start
    }

    const boxes = getBoxes();
    boxes[editable[nextPos]].focus();
  }

  function focusFirstEmpty() {
    const boxes = getBoxes();
    const editable = getEditableIndices();
    for (const i of editable) {
      if (!boxes[i].value) {
        boxes[i].focus();
        return;
      }
    }
    // All filled — focus last editable
    if (editable.length > 0) {
      boxes[editable[editable.length - 1]].focus();
    }
  }

  function attachBoxListeners() {
    const boxes = getBoxes();

    boxes.forEach((box, i) => {
      if (box.readOnly) return;

      box.addEventListener('input', (e) => {
        const val = box.value;
        // Only allow letters
        if (val && !/^[a-zA-Z]$/.test(val)) {
          box.value = '';
          return;
        }

        if (val) {
          box.classList.add('typed');
          // Save typed letter
          if (!state.typedLetters) state.typedLetters = {};
          state.typedLetters[i] = val;
          // Auto-advance to next empty editable box
          focusNextEditable(i, true);
        } else {
          box.classList.remove('typed');
          if (state.typedLetters) delete state.typedLetters[i];
        }
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
          if (box.value) {
            box.value = '';
            box.classList.remove('typed');
            if (state.typedLetters) delete state.typedLetters[i];
          } else {
            // Move back to previous editable box and clear it
            e.preventDefault();
            const editable = getEditableIndices();
            const currentPos = editable.indexOf(i);
            if (currentPos > 0) {
              const prevIdx = editable[currentPos - 1];
              const prevBox = boxes[prevIdx];
              prevBox.value = '';
              prevBox.classList.remove('typed');
              if (state.typedLetters) delete state.typedLetters[prevIdx];
              prevBox.focus();
            }
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          focusNextEditable(i, false);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          focusNextEditable(i, true);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          submitGuess();
        }
      });

      // Select content on focus for easy overwrite
      box.addEventListener('focus', () => {
        box.select();
        // Scroll box into view on mobile when keyboard opens
        setTimeout(() => {
          box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      });

      // Handle clicking/tapping on a box — select for easy overwrite
      box.addEventListener('touchstart', (e) => {
        // Prevent double-tap zoom
        if (box === document.activeElement) {
          e.preventDefault();
          box.select();
        }
      }, { passive: false });

      box.addEventListener('mousedown', () => {
        setTimeout(() => box.select(), 0);
      });
    });
  }

  function renderGuessHistory() {
    guessHistoryEl.innerHTML = '';
    state.guesses.forEach((guess, i) => {
      const item = document.createElement('div');
      item.className = 'guess-item wrong';
      item.innerHTML = `
        <span class="guess-number">${i + 1}</span>
        <span class="guess-word">${guess}</span>
        <span class="guess-result"></span>
      `;
      guessHistoryEl.appendChild(item);
    });
  }

  function updateHintButtons() {
    letterHintBtn.disabled = state.solved || state.revealedLetters.length >= state.word.word.length;

    const unrevealed = state.word.word.length - state.revealedLetters.length;
    if (unrevealed === 0) {
      letterHintBtn.querySelector('.hint-label').textContent = 'All Revealed';
    } else {
      letterHintBtn.querySelector('.hint-label').textContent = `Reveal Letter (${unrevealed} left)`;
    }
  }

  // ===== Hints =====
  function revealLetter() {
    if (state.solved) return;

    const word = state.word.word;
    const len = word.length;

    // Build the sequential reveal order: 1st, 2nd, 3rd, ...
    const revealOrder = [];
    for (let i = 0; i < len; i++) {
      revealOrder.push(i);
    }

    // Find the next index in the order that hasn't been revealed yet
    const nextIdx = revealOrder.find(i => !state.revealedLetters.includes(i));
    if (nextIdx === undefined) return;

    state.revealedLetters.push(nextIdx);
    state.hintsUsed++;

    // Clean up any user-typed letter at the revealed position
    if (state.typedLetters && state.typedLetters[nextIdx]) {
      delete state.typedLetters[nextIdx];
    }

    renderBlanks();
    updateHintButtons();
    saveState();

    // If all letters are now revealed, auto-solve
    if (state.revealedLetters.length >= state.word.word.length) {
      state.solved = true;
      state.typedLetters = {};
      saveState();

      if (!testMode) {
        const stats = loadStats();
        stats.played++;
        stats.wins++;
        stats.currentStreak++;
        if (stats.currentStreak > stats.bestStreak) {
          stats.bestStreak = stats.currentStreak;
        }
        saveStats(stats);
      }

      renderBlanks();
      updateHintButtons();
      setTimeout(() => showResult(true), 400);
    }
  }

  // ===== Guessing =====
  function submitGuess() {
    if (state.solved) return;

    const boxes = getBoxes();
    const word = state.word.word;

    // Build guess from boxes — revealed letters fill in automatically
    let guess = '';
    let allFilled = true;
    for (let i = 0; i < word.length; i++) {
      if (state.revealedLetters.includes(i)) {
        guess += word[i].toLowerCase();
      } else {
        const val = boxes[i].value.trim().toLowerCase();
        if (!val) {
          allFilled = false;
        }
        guess += val;
      }
    }

    if (!allFilled) {
      showToast('Fill in all letters!');
      focusFirstEmpty();
      return;
    }

    // Check if already guessed
    if (state.guesses.includes(guess)) {
      showToast('Already guessed!');
      return;
    }

    const correct = guess === word.toLowerCase();

    if (correct) {
      state.solved = true;
      state.typedLetters = {};
      saveState();

      // Update stats (skip in test mode)
      if (!testMode) {
        const stats = loadStats();
        stats.played++;
        stats.wins++;
        stats.currentStreak++;
        if (stats.currentStreak > stats.bestStreak) {
          stats.bestStreak = stats.currentStreak;
        }
        saveStats(stats);
      }

      renderBlanks();
      updateHintButtons();
      showResult(true);
    } else {
      state.guesses.push(guess);
      saveState();
      renderGuessHistory();

      // Shake all boxes
      boxes.forEach(b => {
        b.classList.add('shake');
        setTimeout(() => b.classList.remove('shake'), 500);
      });

      // Clear typed letters for retry
      boxes.forEach((b, i) => {
        if (!state.revealedLetters.includes(i)) {
          b.value = '';
          b.classList.remove('typed');
        }
      });
      state.typedLetters = {};

      // Focus first empty
      setTimeout(() => focusFirstEmpty(), 100);
    }
  }

  // ===== Result =====
  function getTier(totalGuesses, totalHints, allRevealed) {
    if (allRevealed) {
      return { emoji: '📚', title: 'Much to Learn' };
    } else if (totalHints === 0 && totalGuesses === 0) {
      return { emoji: '🧙', title: 'Word Wizard' };
    } else if (totalHints === 0) {
      return { emoji: '🎓', title: 'Scholar' };
    } else if (totalHints <= 2) {
      return { emoji: '✨', title: 'Impressive' };
    } else {
      return { emoji: '💪', title: 'Got It' };
    }
  }

  function showResult(animate) {
    const totalGuesses = state.guesses.length;
    const totalHints = state.hintsUsed;
    const allRevealed = state.revealedLetters.length >= state.word.word.length;

    const { emoji, title } = getTier(totalGuesses, totalHints, allRevealed);

    resultEmoji.textContent = emoji;
    resultTitle.textContent = title;
    resultWord.textContent = state.word.word;
    statGuesses.textContent = totalGuesses;
    $('#statLetters').textContent = state.revealedLetters.length;

    resultSection.hidden = false;

    // Disable input
    submitBtn.disabled = true;

    if (!animate) {
      resultSection.style.animation = 'none';
    }
  }

  // ===== Share =====
  function shareResult() {
    const puzzleNum = getPuzzleNumber(state.todayKey);
    const guesses = state.guesses.length;
    const hints = state.hintsUsed;
    const word = state.word.word;

    // Build share grid
    let grid = '';
    const redSquare = '\u{1F7E5}';
    const greenCircle = '\u{1F7E2}';
    const letters = word.length;
    for (let i = 0; i < letters; i++) {
      if (state.revealedLetters.includes(i)) {
        grid += redSquare;
      } else {
        grid += greenCircle;
      }
    }

    const letterHints = state.revealedLetters.length;
    const allRevealed = letterHints >= word.length;
    const { emoji: tierEmoji, title: tierTitle } = getTier(guesses, hints, allRevealed);

    const text = `LEXICON #${puzzleNum}\n\n` +
      `${tierEmoji} ${tierTitle}\n\n` +
      `📖 ${word.length} letters\n` +
      `🎯 ${guesses} guess${guesses !== 1 ? 'es' : ''}\n` +
      `💡 ${letterHints} letter${letterHints !== 1 ? 's' : ''} revealed\n\n` +
      `${grid}\n\n` +
      `Play at: https://nicmowll.github.io/LexiconGame/`;

    if (navigator.share) {
      navigator.share({ text }).catch(() => {
        copyToClipboard(text);
      });
    } else {
      copyToClipboard(text);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!');
    }).catch(() => {
      showToast('Could not copy');
    });
  }

  // ===== Toast =====
  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2000);
  }

  // ===== Countdown =====
  function startCountdown() {
    function update() {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const diff = tomorrow - now;
      const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');

      countdownEl.textContent = `${h}:${m}:${s}`;
    }

    update();
    setInterval(update, 1000);
  }

  // ===== Stats Modal =====
  function showStats() {
    const stats = loadStats();
    $('#totalPlayed').textContent = stats.played;
    $('#totalWins').textContent = stats.wins;
    $('#currentStreak').textContent = stats.currentStreak;
    $('#bestStreak').textContent = stats.bestStreak;
    statsModal.hidden = false;
  }

  // ===== Event Listeners =====
  letterHintBtn.addEventListener('click', () => {
    revealLetter();
    setTimeout(() => focusFirstEmpty(), 50);
  });
  submitBtn.addEventListener('click', submitGuess);
  shareBtn.addEventListener('click', shareResult);

  // Modals
  helpBtn.addEventListener('click', () => { helpModal.hidden = false; });
  helpClose.addEventListener('click', () => { helpModal.hidden = true; });
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.hidden = true;
  });

  statsBtn.addEventListener('click', showStats);
  statsClose.addEventListener('click', () => { statsModal.hidden = true; });
  statsModal.addEventListener('click', (e) => {
    if (e.target === statsModal) statsModal.hidden = true;
  });

  // ===== Test Mode (Ctrl+Shift+T) =====
  let testMode = false;

  function startTestMode() {
    testMode = true;
    const randomIndex = Math.floor(Math.random() * WORDS.length);
    state = {
      todayKey: getTodayKey(),
      wordIndex: randomIndex,
      word: WORDS[randomIndex],
      guesses: [],
      hintsUsed: 0,
      originRevealed: false,
      revealedLetters: [],
      solved: false,
    };

    // Reset UI
    resultSection.hidden = true;
    submitBtn.disabled = false;
    guessHistoryEl.innerHTML = '';

    puzzleNumberEl.textContent = '🧪 TEST';
    puzzleDateEl.textContent = 'Test Mode — F2 for new word';

    renderDefinition();
    renderBlanks();
    updateHintButtons();
    setTimeout(() => focusFirstEmpty(), 50);

    showToast('🧪 Test mode — random word loaded!');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      startTestMode();
    }
  });

  // ===== Mobile Viewport Fix =====
  // When virtual keyboard opens on mobile, adjust the layout
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      document.documentElement.style.setProperty(
        '--vh',
        `${window.visualViewport.height * 0.01}px`
      );
    });
  }

  // ===== Start =====
  init();

})();
