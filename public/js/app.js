// Date update
function updateDate() {
  const el = document.getElementById('topbarDate');
  if (!el) return;
  const now = new Date();
  const opts = { month: 'short', day: '2-digit', year: 'numeric', weekday: 'long' };
  const parts = now.toLocaleDateString('en-US', opts).split(', ');
  if (parts.length >= 3) {
    el.textContent = parts[1] + ', ' + parts[2] + ' \u2014 ' + parts[0];
  } else {
    el.textContent = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }
}

// Counter animation
function animateCounter(id, target, duration) {
  duration = duration || 800;
  const el = document.getElementById(id);
  if (!el) return;
  const initial = parseInt(el.textContent.replace(/[,]/g, '')) || 0;
  const start = Date.now();
  const tick = () => {
    const progress = Math.min((Date.now() - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(initial + (target - initial) * ease);
    el.textContent = current.toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  };
  tick();
}



// Flag submission via AJAX
document.addEventListener('DOMContentLoaded', function() {
  const flagForm = document.getElementById('flagForm');
  if (flagForm) {
    const input = flagForm.querySelector('.flag-input');
    const btn = flagForm.querySelector('.flag-submit');
    const result = document.getElementById('flagResult');

    flagForm.addEventListener('submit', function(e) {
      e.preventDefault();
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Checking';
      result.innerHTML = '';
      fetch(flagForm.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(flagForm))
      }).then(r => r.json()).then(data => {
        if (data.correct) {
          result.innerHTML = '<div class="flag-result" style="background:rgba(48,209,88,0.12);border:1px solid rgba(48,209,88,0.2);color:var(--green);display:flex;align-items:center;gap:8px"><span style="font-size:18px">\u2713</span> ' + data.message + '</div>';
          input.disabled = true;
          launchConfetti();
          setTimeout(() => location.reload(), 2500);
        } else {
          result.innerHTML = '<div class="flag-result" style="background:rgba(255,45,45,0.1);border:1px solid rgba(255,45,45,0.2);color:var(--accent);display:flex;align-items:center;gap:8px"><span style="font-size:18px">\u2717</span> ' + data.message + '</div>';
          btn.disabled = false;
          btn.textContent = 'Submit';
          input.focus();
        }
      }).catch(() => {
        result.innerHTML = '<div class="flag-result" style="background:rgba(255,45,45,0.1);border:1px solid rgba(255,45,45,0.2);color:var(--accent)">\u2717 Network error</div>';
        btn.disabled = false;
        btn.textContent = 'Submit';
      });
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !btn.disabled) {
        flagForm.dispatchEvent(new Event('submit'));
      }
    });
  }
});

// Global search
document.addEventListener('DOMContentLoaded', function() {
  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('input', function() {
      const q = this.value.toLowerCase();
      document.querySelectorAll('.incident-row, .lab-card, tr').forEach(el => {
        const text = el.textContent.toLowerCase();
        el.style.display = text.includes(q) ? '' : 'none';
      });
    });
  }

  const challengeSearch = document.getElementById('challengeSearch');
  if (challengeSearch) {
    challengeSearch.addEventListener('input', function() {
      const q = this.value.toLowerCase();
      document.querySelectorAll('#challengeGrid .lab-card').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  const userSearch = document.getElementById('userSearch');
  if (userSearch) {
    userSearch.addEventListener('input', function() {
      const q = this.value.toLowerCase();
      document.querySelectorAll('table tbody tr').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
});

// Challenge difficulty filter with active state
document.addEventListener('DOMContentLoaded', function() {
  const grid = document.getElementById('challengeGrid');
  if (!grid) return;

  const filters = ['filterAll', 'filterEasy', 'filterMedium', 'filterHard', 'filterInsane'];
  const difficultyMap = { filterEasy: 'easy', filterMedium: 'medium', filterHard: 'hard', filterInsane: 'insane' };

  let activeFilter = 'filterAll';
  let showSolvedOnly = false;

  function applyFilters() {
    const cards = grid.querySelectorAll('.lab-card');
    cards.forEach(card => {
      const diffMatch = activeFilter === 'filterAll' || card.dataset.difficulty === difficultyMap[activeFilter];
      const solvedMatch = !showSolvedOnly || card.dataset.solved === 'true';
      card.style.display = diffMatch && solvedMatch ? '' : 'none';
    });
    filters.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.toggle('accent', id === activeFilter);
    });
    const solvedBtn = document.getElementById('showSolved');
    if (solvedBtn) {
      solvedBtn.classList.toggle('accent', showSolvedOnly);
      solvedBtn.textContent = showSolvedOnly ? 'All' : 'Solved \u2713';
    }
  }

  filters.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', function() {
        activeFilter = id;
        applyFilters();
      });
    }
  });

  const showSolved = document.getElementById('showSolved');
  if (showSolved) {
    showSolved.addEventListener('click', function() {
      showSolvedOnly = !showSolvedOnly;
      applyFilters();
    });
  }

  applyFilters();
});

// Chart tabs
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      const header = this.closest('.card-header');
      if (header) {
        header.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      }
      this.classList.add('active');
    });
  });
});

// Toggle switches
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.toggle').forEach(t => {
    t.addEventListener('click', function() {
      this.classList.toggle('on');
      const cb = this.querySelector('input[type=checkbox]');
      if (cb) cb.checked = !cb.checked;
    });
  });
});

// Sidebar overlay close
document.addEventListener('DOMContentLoaded', function() {
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) {
    overlay.addEventListener('click', function() {
      document.getElementById('sidebar')?.classList.remove('active');
      this.classList.remove('active');
    });
  }
});

// Toast notification system
function showToast(message, type) {
  type = type || 'info';
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  const icons = { success: '\u2713', error: '\u2717', info: '\u24D8' };
  toast.innerHTML = '<span style="font-size:14px">' + (icons[type] || '') + '</span><span>' + message + '</span>';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// Confetti
function launchConfetti() {
  const colors = ['#FF2D2D','#00C2FF','#30D158','#FF9500','#BF5AF2','#F0F0F0','#FFD60A'];
  // Falling confetti pieces
  for (let i = 0; i < 120; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.top = '-10px';
    piece.style.width = (Math.random() * 8 + 4) + 'px';
    piece.style.height = (Math.random() * 8 + 4) + 'px';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animationDuration = (Math.random() * 2.5 + 1.5) + 's';
    piece.style.animationDelay = (Math.random() * 1.5) + 's';
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 5000);
  }
  // Center burst (star explosion)
  for (let i = 0; i < 30; i++) {
    const star = document.createElement('div');
    const angle = (i / 30) * 360;
    const distance = Math.random() * 200 + 100;
    const size = Math.random() * 6 + 4;
    star.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;width:'+size+'px;height:'+size+'px;background:'+colors[Math.floor(Math.random()*colors.length)]+';border-radius:2px;left:50vw;top:50vh;transform:translate(-50%,-50%);animation:confetti-burst 1s ease-out forwards;--angle:'+angle+'deg;--dist:'+distance+'px';
    document.body.appendChild(star);
    setTimeout(() => star.remove(), 2000);
  }
}
