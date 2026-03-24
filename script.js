// ── PARTICLE NETWORK BACKGROUND ─────────────────────────────
(function () {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');

  const PARTICLE_COUNT = 120;
  const CONNECTION_DIST = 140;
  const MOUSE_RADIUS = 180;
  const MOUSE_PULL = 0.012;

  const ACCENT = { r: 249, g: 115, b: 22 };

  let mouse = { x: -999, y: -999 };
  let W, H, particles;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() { this.reset(true); }

    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : -8;
      this.vx = (Math.random() - 0.5) * 0.35;
      this.vy = (Math.random() - 0.5) * 0.35;
      this.r = Math.random() * 1.8 + 0.8;
      this.base = Math.random() * 0.4 + 0.15;
      this.opacity = this.base;
    }

    update() {
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < MOUSE_RADIUS) {
        const force = (1 - dist / MOUSE_RADIUS) * MOUSE_PULL;
        this.vx += dx * force;
        this.vy += dy * force;
      }

      // dampen velocity
      this.vx *= 0.98;
      this.vy *= 0.98;

      this.x += this.vx;
      this.y += this.vy;

      // wrap edges
      if (this.x < -10) this.x = W + 10;
      if (this.x > W + 10) this.x = -10;
      if (this.y < -10) this.y = H + 10;
      if (this.y > H + 10) this.y = -10;
    }

    draw() {
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const proximity = Math.max(0, 1 - dist / MOUSE_RADIUS);

      // interpolate color: white → accent
      const r = Math.round(200 + (ACCENT.r - 200) * proximity);
      const g = Math.round(200 + (ACCENT.g - 200) * proximity);
      const b = Math.round(200 + (ACCENT.b - 200) * proximity);
      const a = this.base + proximity * 0.7;
      const radius = this.r + proximity * 2.5;

      ctx.beginPath();
      ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.fill();
    }
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > CONNECTION_DIST) continue;

        const t = 1 - dist / CONNECTION_DIST;

        // check if either particle is near mouse
        const aDist = Math.hypot(mouse.x - a.x, mouse.y - a.y);
        const bDist = Math.hypot(mouse.x - b.x, mouse.y - b.y);
        const nearMouse = Math.min(aDist, bDist) < MOUSE_RADIUS;
        const proximity = nearMouse
          ? Math.max(0, 1 - Math.min(aDist, bDist) / MOUSE_RADIUS)
          : 0;

        const r = Math.round(80 + (ACCENT.r - 80) * proximity);
        const g = Math.round(80 + (ACCENT.g - 80) * proximity);
        const bC = Math.round(80 + (ACCENT.b - 80) * proximity);
        const alpha = t * (0.08 + proximity * 0.35);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(${r},${g},${bC},${alpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }

  function init() {
    resize();
    particles = Array.from({ length: PARTICLE_COUNT }, () => new Particle());
    canvas.classList.add('ready');
    loop();
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => p.update());
    drawConnections();
    particles.forEach(p => p.draw());
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => { resize(); });
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('mouseleave', () => { mouse.x = -999; mouse.y = -999; });

  init();
})();

document.addEventListener("DOMContentLoaded", () => {

  // ── PRELOADER — Apple "Hello" Screen ────────────────────
  const preloader = document.getElementById('preloader');
  const helloWord = document.getElementById('hello-word');
  const helloLang = document.getElementById('hello-lang');

  const greetings = [
    { word: 'Hola',      lang: 'Spanish'  },
    { word: 'Bonjour',   lang: 'French'   },
    { word: 'नमस्ते',    lang: 'Hindi'    },
    { word: 'ನಮಸ್ಕಾರ',   lang: 'Kannada'  },
    { word: 'నమస్కారం',  lang: 'Telugu'   },
    { word: 'வணக்கம்',   lang: 'Tamil'    },
    { word: 'Ciao',      lang: 'Italian'  },
    { word: 'こんにちは', lang: 'Japanese' },
    { word: 'Hello',     lang: 'English'  },
  ];

  let index = 0;

  function showGreeting(i) {
    helloWord.classList.remove('visible');
    helloLang.classList.remove('visible');

    setTimeout(() => {
      helloWord.textContent = greetings[i].word;
      helloLang.textContent = greetings[i].lang;
      helloWord.classList.add('visible');
      helloLang.classList.add('visible');
    }, 200);
  }

  // Show first greeting immediately
  showGreeting(0);
  index = 1;

  const interval = setInterval(() => {
    if (index < greetings.length) {
      showGreeting(index);
      index++;
    } else {
      clearInterval(interval);
      // Hold the final "Hello" a beat longer, then exit
      setTimeout(() => {
        preloader.classList.add('done');
      }, 500);
    }
  }, 300);
  // ─────────────────────────────────────────────────────────

  // ── CUSTOM CURSOR ────────────────────────────────────────
  const cursorDot = document.querySelector('.cursor-dot');
  const cursorOutline = document.querySelector('.cursor-outline');

  window.addEventListener('mousemove', (e) => {
    const x = e.clientX;
    const y = e.clientY;

    cursorDot.style.left = `${x}px`;
    cursorDot.style.top = `${y}px`;

    cursorOutline.animate(
      { left: `${x}px`, top: `${y}px` },
      { duration: 350, fill: 'forwards', easing: 'ease-out' }
    );
  });

  const interactives = document.querySelectorAll('a, button, .project-card, .cert-card, .service-item');
  interactives.forEach(el => {
    el.addEventListener('mouseenter', () => {
      cursorOutline.style.width = '64px';
      cursorOutline.style.height = '64px';
      cursorOutline.style.borderColor = 'rgba(249, 115, 22, 0.8)';
      cursorOutline.style.background = 'rgba(249, 115, 22, 0.08)';
      cursorDot.style.transform = 'translate(-50%, -50%) scale(0)';
    });
    el.addEventListener('mouseleave', () => {
      cursorOutline.style.width = '36px';
      cursorOutline.style.height = '36px';
      cursorOutline.style.borderColor = 'rgba(249, 115, 22, 0.5)';
      cursorOutline.style.background = 'transparent';
      cursorDot.style.transform = 'translate(-50%, -50%) scale(1)';
    });
  });

  // ── CONTACT FORM ─────────────────────────────────────────
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('.form-submit');
      const submitText = form.querySelector('.submit-text');
      const submitSent = form.querySelector('.submit-sent');
      btn.disabled = true;
      submitText.style.display = 'none';
      submitSent.style.display = 'inline';
      try {
        await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { 'Accept': 'application/json' }
        });
      } catch (_) {}
      form.reset();
      setTimeout(() => {
        btn.disabled = false;
        submitText.style.display = 'inline';
        submitSent.style.display = 'none';
      }, 4000);
    });
  }

  // ── THEME TOGGLE ─────────────────────────────────────────
  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light');
    themeToggle.textContent = '🌙';
  }

  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light');
    const isLight = document.body.classList.contains('light');
    themeToggle.textContent = isLight ? '🌙' : '☀️';
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  });

  // ── ROLE CYCLING ─────────────────────────────────────────
  const roleEl = document.getElementById('role-cycle');
  const roles = ['Data Analyst', 'BI Developer', 'Cloud Architect', 'Data Engineer'];
  let roleIndex = 0;

  setInterval(() => {
    roleEl.classList.add('fade');
    setTimeout(() => {
      roleIndex = (roleIndex + 1) % roles.length;
      roleEl.textContent = roles[roleIndex];
      roleEl.classList.remove('fade');
    }, 250);
  }, 2200);

  // ── SCROLL REVEAL ────────────────────────────────────────
  const revealEls = document.querySelectorAll('.reveal');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // Stagger siblings slightly
        const siblings = [...entry.target.parentElement.querySelectorAll('.reveal')];
        const idx = siblings.indexOf(entry.target);
        setTimeout(() => {
          entry.target.classList.add('active');
        }, idx * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  revealEls.forEach(el => observer.observe(el));

  // ── SCROLL PROGRESS BAR ──────────────────────────────────
  const progressBar = document.getElementById('scroll-progress');
  const backToTop = document.getElementById('back-to-top');

  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.width = `${(scrollTop / docHeight) * 100}%`;
    backToTop.classList.toggle('visible', scrollTop > 400);
  });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── NAVBAR BACKGROUND ON SCROLL ──────────────────────────
  const navPill = document.querySelector('.nav-pill');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      navPill.style.background = 'rgba(8, 8, 8, 0.95)';
      navPill.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
    } else {
      navPill.style.background = 'rgba(12, 12, 12, 0.85)';
      navPill.style.boxShadow = 'none';
    }
  });

  // ── ACTIVE NAV LINK ON SCROLL ─────────────────────────────
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link:not(.nav-cta)');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(link => {
          const isActive = link.getAttribute('href') === `#${entry.target.id}`;
          link.style.color = isActive ? 'var(--accent)' : '';
          link.style.background = isActive ? 'var(--accent-dim)' : '';
        });
      }
    });
  }, { threshold: 0.35 });

  sections.forEach(s => sectionObserver.observe(s));

});
