var firebaseConfig = {
  apiKey: "AIzaSyAgvJHhEzCFFl4UBgyoWhHeSRZO2e6tikM",
  authDomain: "q-game-3c224.firebaseapp.com",
  databaseURL: "https://q-game-3c224-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "q-game-3c224",
  storageBucket: "q-game-3c224.appspot.com",
  messagingSenderId: "685733322297",
  appId: "1:685733322297:web:4e2f5f159de26cca65b7e8"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

const urlParams = new URLSearchParams(window.location.search);
const room = urlParams.get("room") || "default-room";

// 🔐 Authentication state
let currentUser = null;
let isAuthenticated = false;

// 🔐 Password-based host system
const HOST_PASSWORD = "host123"; // You can change this
let playerId = null;
let isHost = false;

// 🎵 Music System
let musicEnabled = true;
let currentMusic = null;

// Create audio elements for each theme
const musicTracks = {
  pav: new Audio('/static/pav.mp3'),
  kari: new Audio('/static/kari.mp3'),
  oman: new Audio('/static/oman.mp3'),
  raj: new Audio('/static/raj.mp3'),
  biswa: new Audio('/static/biswa.mp3')
};

// Set up music properties
Object.values(musicTracks).forEach(audio => {
  audio.loop = true;
  audio.volume = 0.3;
  audio.preload = 'auto';
});

function toggleMusic() {
  musicEnabled = !musicEnabled;
  const btn = document.getElementById('music-toggle');
  
  if (musicEnabled) {
    btn.textContent = '🔊 Music On';
    btn.classList.remove('music-off');
    // Resume current theme music
    const currentTheme = localStorage.getItem('theme') || 'pav';
    playThemeMusic(currentTheme);
  } else {
    btn.textContent = '🔇 Music Off';
    btn.classList.add('music-off');
    // Stop all music
    stopAllMusic();
  }
  
  localStorage.setItem('musicEnabled', musicEnabled);
}

function playThemeMusic(theme) {
  if (!musicEnabled) return;
  
  // Stop current music
  stopAllMusic();
  
  // Play new theme music
  if (musicTracks[theme]) {
    currentMusic = musicTracks[theme];
    currentMusic.currentTime = 0;
    currentMusic.play().catch(e => {
      console.log('Audio play failed:', e);
      // Auto-enable music on first user interaction
      document.addEventListener('click', () => {
        if (musicEnabled && currentMusic) {
          currentMusic.play().catch(err => console.log('Retry play failed:', err));
        }
      }, { once: true });
    });
  }
}

function stopAllMusic() {
  Object.values(musicTracks).forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
  currentMusic = null;
}

// 🔐 Improved Authentication with better error handling
function initializeAuth() {
  return new Promise((resolve, reject) => {
    console.log("🔄 Starting authentication...");
    
    // Set up auth state listener
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        // User is signed in
        currentUser = user;
        isAuthenticated = true;
        console.log("✅ User authenticated:", user.uid);
        unsubscribe(); // Stop listening
        resolve(user);
      } else {
        // User is signed out, try to sign in anonymously
        console.log("🔄 No user found, signing in anonymously...");
        auth.signInAnonymously()
          .then(() => {
            console.log("✅ Anonymous sign in initiated");
            // Will trigger onAuthStateChanged again with the user
          })
          .catch((error) => {
            console.error("❌ Anonymous sign in failed:", error);
            unsubscribe(); // Stop listening
            reject(error);
          });
      }
    });

    // Timeout fallback
    setTimeout(() => {
      if (!isAuthenticated) {
        console.warn("⏰ Auth timeout");
        unsubscribe(); // Stop listening
        reject(new Error("Authentication timeout"));
      }
    }, 10000); // Increased timeout to 10 seconds
  });
}

// 🔐 Initialize user after authentication
async function initializeUser() {
  try {
    // Show loading message
    const questionBox = document.getElementById("question-box");
    questionBox.innerText = "🔐 Connecting to Firebase...";
    
    // Wait for authentication
    await initializeAuth();
    
    questionBox.innerText = "👤 Setting up player...";
    
    // Now get player name and host status
    playerId = prompt("Enter your name:") || `Player_${Math.floor(Math.random() * 1000)}`;
    const hostPassword = prompt("Enter host password (leave empty if you're not host):");
    isHost = hostPassword === HOST_PASSWORD;

    if (isHost) {
      alert("✅ You are now the host!");
    } else if (hostPassword && hostPassword !== HOST_PASSWORD) {
      alert("❌ Wrong password. You'll join as a regular player.");
    }

    console.log("✅ Game initialized for room:", room, "Player:", playerId, "Host:", isHost, "Auth:", isAuthenticated);
    
    questionBox.innerText = "🎮 Loading game...";
    
    // Initialize the game
    await initializeGame();
    
  } catch (error) {
    console.error("❌ Failed to initialize user:", error);
    const questionBox = document.getElementById("question-box");
    questionBox.innerText = "❌ Connection failed. Please refresh the page.";
    
    // Show retry button
    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Retry Connection';
    retryBtn.onclick = () => {
      location.reload();
    };
    questionBox.appendChild(document.createElement('br'));
    questionBox.appendChild(retryBtn);
  }
}

// 🎮 Game variables
let currentQ = 1;
let answered = false;
let answersHistory = {}; // Store all answers history
let playerProfiles = {}; // Store player profiles

// DOM elements
const questionBox = document.getElementById("question-box");
const answerInput = document.getElementById("answer-input");
const submitBtn = document.getElementById("submit-btn");
const nextBtn = document.getElementById("next-btn");
const chatBox = document.getElementById("chat-box");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const answersList = document.getElementById("answers-list");
const waitingStatus = document.getElementById("waiting-status");
const playerCountBox = document.getElementById("player-count");
const historyContent = document.getElementById("history-content");
const exportBtn = document.getElementById("export-btn");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const emojiContainer = document.getElementById("emoji-reactions");
const wordCloudContainer = document.getElementById("word-cloud");
const profileContainer = document.getElementById("player-profiles");

// 👤 Player Profile System
function initializePlayerProfile() {
  const savedProfile = localStorage.getItem(`profile_${playerId}`);
  if (savedProfile) {
    playerProfiles[playerId] = JSON.parse(savedProfile);
  } else {
    playerProfiles[playerId] = {
      name: playerId,
      avatar: getRandomAvatar(),
      color: getRandomColor(),
      gamesPlayed: 0,
      questionsAnswered: 0,
      favoriteAnswers: [],
      joinDate: new Date().toISOString(),
      uid: currentUser ? currentUser.uid : `temp_${Date.now()}` // Fallback UID
    };
    savePlayerProfile();
  }
  
  // Sync to Firebase with error handling
  database.ref(`/${room}/profiles/${playerId}`).set(playerProfiles[playerId])
    .then(() => console.log("✅ Profile synced to Firebase"))
    .catch(error => console.error("❌ Profile sync failed:", error));
}

function getRandomAvatar() {
  const avatars = ['🐱', '🐶', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐸', '🐵'];
  return avatars[Math.floor(Math.random() * avatars.length)];
}

function getRandomColor() {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function savePlayerProfile() {
  localStorage.setItem(`profile_${playerId}`, JSON.stringify(playerProfiles[playerId]));
}

function updatePlayerStats(action) {
  if (!playerProfiles[playerId]) return;
  
  switch(action) {
    case 'answer':
      playerProfiles[playerId].questionsAnswered++;
      break;
    case 'game':
      playerProfiles[playerId].gamesPlayed++;
      break;
  }
  
  savePlayerProfile();
  database.ref(`/${room}/profiles/${playerId}`).set(playerProfiles[playerId])
    .catch(error => console.error("❌ Stats update failed:", error));
}

// 🎨 Theme System with Music
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
  // Update active button
  document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.theme-btn.${theme}`).classList.add('active');
  
  // Play theme music
  playThemeMusic(theme);
}

// Initialize theme and music
const savedTheme = localStorage.getItem('theme') || 'pav';
const savedMusicEnabled = localStorage.getItem('musicEnabled');
if (savedMusicEnabled !== null) {
  musicEnabled = savedMusicEnabled === 'true';
}

setTheme(savedTheme);

// Create music toggle button dynamically
const musicToggleBtn = document.createElement('button');
musicToggleBtn.id = 'music-toggle';
musicToggleBtn.className = 'music-toggle-btn';
musicToggleBtn.textContent = musicEnabled ? '🔊 Music On' : '🔇 Music Off';
musicToggleBtn.onclick = toggleMusic;
if (!musicEnabled) musicToggleBtn.classList.add('music-off');

// Add music toggle to theme controls
document.querySelector('.theme-controls').appendChild(musicToggleBtn);

// 🧹 Clear History Function
function clearHistory() {
  if (confirm("Are you sure you want to clear the answers history? This cannot be undone.")) {
    answersHistory = {};
    updateAnswersHistory();
    // Clear from Firebase
    database.ref(`/${room}/history`).remove()
      .then(() => alert("History cleared! 🧹"))
      .catch(error => {
        console.error("❌ Clear history failed:", error);
        alert("Failed to clear history. Please try again.");
      });
  }
}

clearHistoryBtn.addEventListener('click', clearHistory);

// 🎭 Flying Emoji Reactions
function sendReaction(emoji) {
  if (!isAuthenticated) {
    console.warn("Cannot send reaction - not authenticated");
    return;
  }
  
  database.ref(`/${room}/reactions`).push({
    emoji: emoji,
    player: playerId,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).catch(error => console.error("❌ Reaction send failed:", error));
  
  createFlyingEmoji(emoji);
}

function createFlyingEmoji(emoji) {
  const emojiEl = document.createElement('div');
  emojiEl.className = 'flying-emoji';
  emojiEl.textContent = emoji;
  
  emojiEl.style.left = Math.random() * window.innerWidth + 'px';
  emojiEl.style.top = window.innerHeight + 'px';
  
  emojiContainer.appendChild(emojiEl);
  
  setTimeout(() => {
    emojiEl.remove();
  }, 3000);
}

// Listen for reactions from other players
database.ref(`/${room}/reactions`).on("child_added", snap => {
  const reaction = snap.val();
  if (reaction && reaction.player !== playerId) {
    createFlyingEmoji(reaction.emoji);
  }
}, error => {
  console.error("❌ Reactions listener failed:", error);
});

// ☁️ Word Cloud Generation
function generateWordCloud(answers) {
  if (!answers || Object.keys(answers).length === 0) return;
  
  // Combine all answers into one text
  const allText = Object.values(answers).join(' ').toLowerCase();
  
  // Simple word frequency counter
  const words = allText.split(/\s+/).filter(word => 
    word.length > 2 && 
    !['the', 'and', 'but', 'for', 'are', 'with', 'this', 'that', 'have', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were'].includes(word)
  );
  
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  // Sort by frequency
  const sortedWords = Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20); // Top 20 words
  
  // Create word cloud HTML
  let cloudHTML = '<div class="word-cloud-title">☁️ Word Cloud</div><div class="word-cloud-words">';
  
  sortedWords.forEach(([word, count]) => {
    const size = Math.min(12 + count * 4, 32); // Scale font size
    const opacity = Math.min(0.5 + count * 0.1, 1);
    cloudHTML += `<span class="word-cloud-word" style="font-size: ${size}px; opacity: ${opacity}">${word}</span> `;
  });
  
  cloudHTML += '</div>';
  wordCloudContainer.innerHTML = cloudHTML;
  wordCloudContainer.style.display = 'block';
}

// 🎮 New Game Function - Clear previous game data
function startNewGame() {
  if (isHost) {
    console.log("🎮 Starting new game - clearing data...");
    
    // Clear all previous game data
    const clearPromises = [
      database.ref(`/${room}/players`).remove(),
      database.ref(`/${room}/answers`).remove(),
      database.ref(`/${room}/profiles`).remove(),
      database.ref(`/${room}/chat`).remove(),
      database.ref(`/${room}/reactions`).remove(),
      database.ref(`/${room}/history`).remove()
    ];
    
    Promise.all(clearPromises)
      .then(() => {
        console.log("✅ Game data cleared");
        // Reset game state
        return database.ref(`/${room}/current`).set(1);
      })
      .then(() => {
        console.log("✅ Game reset to question 1");
        // Clear local data
        answersHistory = {};
        playerProfiles = {};
        
        // Re-initialize current player
        initializePlayerProfile();
      })
      .catch(error => {
        console.error("❌ New game setup failed:", error);
      });
  }
}

// 🎮 Initialize Game (called after authentication)
async function initializeGame() {
  try {
    // Initialize player profile
    initializePlayerProfile();

    // Initialize room and questions
    const response = await fetch(`/init-room?room=${room}`);
    const data = await response.json();
    console.log("✅ Room initialized:", data);
    updatePlayerStats('game');
    
    // If host, start a fresh game
    if (isHost) {
      startNewGame();
    }

    // 👥 Track live players and profiles with error handling
    await database.ref(`/${room}/players/${playerId}`).set({
      name: playerId,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      uid: currentUser ? currentUser.uid : `temp_${Date.now()}`
    });

    database.ref(`/${room}/players/${playerId}`).onDisconnect().remove();

    database.ref(`/${room}/players`).on("value", snap => {
      const players = snap.val() || {};
      const playerCount = Object.keys(players).length;
      playerCountBox.innerText = `Players online: ${playerCount}`;
      
      // Update player profiles display
      updatePlayerProfilesDisplay();
    }, error => {
      console.error("❌ Players listener failed:", error);
    });

    // Listen for player profiles
    database.ref(`/${room}/profiles`).on("value", snap => {
      const profiles = snap.val() || {};
      Object.assign(playerProfiles, profiles);
      updatePlayerProfilesDisplay();
    }, error => {
      console.error("❌ Profiles listener failed:", error);
    });

    // 👂 Listen for current question number
    database.ref(`/${room}/current`).on("value", snapshot => {
      const q = snapshot.val() || 1;
      console.log("📝 Current question changed to:", q);
      
      // Reset submit button when question changes
      submitBtn.textContent = "Submit Answer";
      submitBtn.disabled = false;
      answered = false; // Reset answered state
      
      loadQuestion(q);
    }, error => {
      console.error("❌ Current question listener failed:", error);
    });

    // Load saved history from Firebase
    database.ref(`/${room}/history`).once("value").then(snapshot => {
      const history = snapshot.val() || {};
      answersHistory = history;
      updateAnswersHistory();
    }).catch(error => {
      console.error("❌ History load failed:", error);
    });

    // 💬 Chat system with error handling
    database.ref(`/${room}/chat`).on("child_added", snap => {
      const data = snap.val();
      if (data && data.name && data.message) {
        const msgEl = document.createElement("div");
        msgEl.className = "chat-message";
        msgEl.innerHTML = `
          <span class="chat-avatar" style="color: ${data.color || '#333'}">${data.avatar || '👤'}</span>
          <b>${data.name}:</b> ${data.message}
        `;
        chatBox.appendChild(msgEl);
        chatBox.scrollTop = chatBox.scrollHeight;
        console.log("💬 Chat message added:", data);
      }
    }, error => {
      console.error("❌ Chat listener failed:", error);
    });

    // Show/hide controls based on host status
    if (isHost) {
      nextBtn.style.display = "inline-block";
    } else {
      nextBtn.style.display = "none";
    }

    console.log("✅ Game initialized successfully");
    
  } catch (error) {
    console.error("❌ Game initialization failed:", error);
    throw error;
  }
}

function updatePlayerProfilesDisplay() {
  let html = '<h3>👥 Players</h3>';
  
  Object.entries(playerProfiles).forEach(([name, profile]) => {
    html += `
      <div class="player-profile" style="border-left: 4px solid ${profile.color}">
        <span class="player-avatar">${profile.avatar}</span>
        <span class="player-name">${profile.name}</span>
        <span class="player-stats">${profile.questionsAnswered} answers</span>
      </div>
    `;
  });
  
  profileContainer.innerHTML = html;
}

// 📄 Export Game Feature
exportBtn.addEventListener('click', () => {
  exportGameResults();
});

function exportGameResults() {
  let exportData = `🎯 20 Questions Game Results\n`;
  exportData += `Room: ${room}\n`;
  exportData += `Date: ${new Date().toLocaleDateString()}\n`;
  exportData += `Players: ${Object.keys(playerProfiles).length}\n\n`;
  
  // Player profiles
  exportData += `👥 PLAYER PROFILES:\n`;
  Object.entries(playerProfiles).forEach(([name, profile]) => {
    exportData += `${profile.avatar} ${profile.name} - ${profile.questionsAnswered} answers, ${profile.gamesPlayed} games\n`;
  });
  exportData += '\n';
  
  // Questions and answers
  Object.entries(answersHistory).forEach(([qNum, data]) => {
    exportData += `Q${qNum}: ${data.question}\n`;
    Object.entries(data.answers).forEach(([player, answer]) => {
      exportData += `  • ${player}: ${answer}\n`;
    });
    exportData += '\n';
  });
  
  const blob = new Blob([exportData], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `20questions-${room}-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  alert('Game results exported successfully! 📄');
}

// 📝 Update answers history display
function updateAnswersHistory() {
  if (Object.keys(answersHistory).length === 0) {
    historyContent.innerHTML = '<p class="no-history">No answers yet...</p>';
    return;
  }

  let historyHTML = '';
  for (let qNum = 1; qNum <= 20; qNum++) {
    if (answersHistory[qNum]) {
      const questionData = answersHistory[qNum];
      historyHTML += `
        <div class="history-question">
          <h4>Q${qNum}: ${questionData.question}</h4>
          <ul class="history-answers">
            ${Object.entries(questionData.answers).map(([name, answer]) => {
              const profile = playerProfiles[name] || {};
              return `<li style="border-left: 3px solid ${profile.color || '#ccc'}">
                <span class="answer-avatar">${profile.avatar || '👤'}</span>
                <b>${name}:</b> ${answer}
              </li>`;
            }).join('')}
          </ul>
        </div>
      `;
    }
  }
  
  historyContent.innerHTML = historyHTML;
}

// 🧠 Load and watch question
function loadQuestion(num) {
  console.log("📝 Loading question:", num);
  currentQ = num;
  answered = false;
  answerInput.value = "";
  answersList.innerHTML = "";
  waitingStatus.innerText = "";
  wordCloudContainer.style.display = 'none';

  // Load question with error handling
  database.ref(`/questions/q${num}`).once("value").then(snapshot => {
    const question = snapshot.val();
    if (question) {
      questionBox.innerText = question;
      console.log("✅ Question loaded:", question);
    } else {
      questionBox.innerText = "🎉 Game Over!";
      console.log("🎉 Game over - no more questions");
    }
  }).catch(error => {
    console.error("❌ Error loading question:", error);
    questionBox.innerText = "❌ Error loading question. Please refresh.";
  });

  // Watch for answers with error handling
  database.ref(`/${room}/answers/q${num}`).on("value", snap => {
    const answers = snap.val() || {};
    const answerEntries = Object.entries(answers);
    
    if (answerEntries.length > 0) {
      let html = '<ul>';
      answerEntries.forEach(([name, ans]) => {
        const profile = playerProfiles[name] || {};
        html += `<li style="border-left: 3px solid ${profile.color || '#ccc'}">
          <span class="answer-avatar">${profile.avatar || '👤'}</span>
          <b>${name}:</b> ${ans}
        </li>`;
      });
      html += '</ul>';
      answersList.innerHTML = html;
      
      // Generate word cloud
      generateWordCloud(answers);
      
      // Store in history
      database.ref(`/questions/q${num}`).once("value").then(questionSnap => {
        const questionText = questionSnap.val();
        if (questionText) {
          answersHistory[num] = {
            question: questionText,
            answers: answers
          };
          updateAnswersHistory();
          
          // Save to Firebase history
          database.ref(`/${room}/history/q${num}`).set(answersHistory[num])
            .catch(error => console.error("❌ History save failed:", error));
        }
      }).catch(error => console.error("❌ Question text load failed:", error));
    } else {
      answersList.innerHTML = "";
      wordCloudContainer.style.display = 'none';
    }

    // Show answer count status
    database.ref(`/${room}/players`).once("value").then(playerSnap => {
      const players = playerSnap.val() || {};
      const total = Object.keys(players).length;
      const submitted = Object.keys(answers).length;
      
      console.log(`📊 Answers: ${submitted}/${total}`);
      
      if (submitted < total && total > 0) {
        waitingStatus.innerText = `Waiting for ${total - submitted} more answers...`;
      } else if (submitted === total && total > 0) {
        waitingStatus.innerText = `All ${total} players have answered! Host can click "Next" to continue.`;
      }
    }).catch(error => console.error("❌ Player count check failed:", error));
  }, error => {
    console.error("❌ Answers listener failed:", error);
  });
}

// 📤 Submit answer
function submitAnswer() {
  const answer = answerInput.value.trim();
  console.log("📤 Submit clicked, answer:", answer, "answered:", answered);
  
  if (!isAuthenticated) {
    alert("Please wait for authentication to complete!");
    return;
  }
  
  if (answered) {
    alert("You have already answered this question!");
    return;
  }
  
  if (!answer) {
    alert("Please enter an answer!");
    return;
  }
  
  database.ref(`/${room}/answers/q${currentQ}/${playerId}`).set(answer)
    .then(() => {
      console.log("✅ Answer submitted successfully");
      answered = true;
      answerInput.value = "";
      submitBtn.textContent = "Submitted!";
      submitBtn.disabled = true;
      
      // Update player stats
      updatePlayerStats('answer');
    })
    .catch(error => {
      console.error("❌ Error submitting answer:", error);
      alert("Error submitting answer. Please try again.");
    });
}

submitBtn.addEventListener('click', submitAnswer);

// ⌨️ Enable submit on Enter key for answer input
answerInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitAnswer();
  }
});

// 💬 Chat system
function sendChatMessage() {
  const msg = chatInput.value.trim();
  console.log("💬 Chat send clicked:", msg);
  
  if (!isAuthenticated) {
    alert("Please wait for authentication to complete!");
    return;
  }
  
  if (!msg) {
    alert("Please enter a message!");
    return;
  }
  
  const profile = playerProfiles[playerId] || {};
  
  database.ref(`/${room}/chat`).push({
    name: playerId,
    message: msg,
    avatar: profile.avatar || '👤',
    color: profile.color || '#333',
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).then(() => {
    console.log("✅ Chat message sent");
    chatInput.value = "";
  }).catch(error => {
    console.error("❌ Error sending chat:", error);
    alert("Error sending message. Please try again.");
  });
}

chatSend.addEventListener('click', sendChatMessage);

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendChatMessage();
  }
});

// 🔘 Host manual next
nextBtn.addEventListener('click', () => {
  console.log("⏭️ Next button clicked, isHost:", isHost);
  
  if (!isHost) {
    alert("Only the host can go to the next question!");
    return;
  }
  
  if (!isAuthenticated) {
    alert("Please wait for authentication to complete!");
    return;
  }
  
  database.ref(`/${room}/current`).once("value").then(snap => {
    const current = snap.val() || 1;
    console.log("📝 Current question:", current);
    
    if (current < 20) {
      database.ref(`/${room}/current`).set(current + 1)
        .then(() => {
          console.log("✅ Advanced to question:", current + 1);
        })
        .catch(error => {
          console.error("❌ Error advancing question:", error);
          alert("Error advancing question. Please try again.");
        });
    } else {
      questionBox.innerText = "🎉 Game Over!";
      alert("Game completed!");
    }
  }).catch(error => {
    console.error("❌ Error checking current question:", error);
  });
});

// 🔐 Start the authentication process when page loads
initializeUser();

console.log("✅ Script loaded successfully");