import { useEffect } from 'react';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  limit,
  increment,
  orderBy,
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, updateProfile } from 'firebase/auth';
import firebaseConfig from '../firebaseConfig.js';

const FORCE_HALLOWEEN = true;

export function useHogsiteApp() {
  useEffect(() => {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    try {
      getAnalytics(app);
    } catch (error) {
      // Analytics is optional (e.g. in SSR/Node environments)
    }
    const db = getFirestore(app);
    const auth = getAuth(app);

    const overlay = document.getElementById('overlay');
    const coinsVal = document.getElementById('coinsVal');
    const streakVal = document.getElementById('streakVal');
    const bonusVal = document.getElementById('bonusVal');
    const dailyTip = document.getElementById('dailyTip');
    const newsList = document.getElementById('newsList');
    const openHQuestsBtn = document.getElementById('openHQuests');
    const playBtn = document.getElementById('playNowBtn');
    const playAutoBtn = document.getElementById('playAutoBtn');
    const autoToggleBtn = document.getElementById('autoToggleBtn');
    const banner = document.getElementById('hBanner');
    const originalBonusText = bonusVal?.textContent ?? '';
    const originalDailyTip = dailyTip?.textContent ?? '';
    const originalBannerDisplay = banner?.style.display ?? '';
    let halloweenNewsItem = null;

    if (!overlay) {
      return undefined;
    }

    const cleanupFns = [];
    function on(el, event, handler) {
      if (!el) return;
      el.addEventListener(event, handler);
      cleanupFns.push(() => el.removeEventListener(event, handler));
    }

    let autoMode = false;
    let autoTimer = null;

    function updateAutoBtnTexts() {
      if (autoToggleBtn) {
        autoToggleBtn.textContent = autoMode ? '⏹️ Stopp auto' : '🤖 Auto-spill';
        autoToggleBtn.classList.toggle('primary', autoMode);
      }
      if (playAutoBtn) {
        playAutoBtn.textContent = autoMode ? '⏹️ Stopp autospill' : '🤖 Autospill nå';
        playAutoBtn.classList.toggle('primary', autoMode);
      }
    }

    function stopAuto() {
      autoMode = false;
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
      updateAutoBtnTexts();
    }

    function openModal(title, contentHTML, { show = true } = {}) {
      overlay.innerHTML = `
        <div class="modal">
          <div class="head">
            <strong>${title}</strong>
            <button class="x" id="closeModal">×</button>
          </div>
          <div class="content">${contentHTML}</div>
        </div>`;
      if (show) {
        overlay.classList.add('active');
      } else {
        overlay.classList.remove('active');
      }
      const closeBtn = document.getElementById('closeModal');
      if (closeBtn) {
        closeBtn.onclick = () => {
          overlay.classList.remove('active');
        };
      }
      overlay.onclick = (event) => {
        if (event.target === overlay) {
          overlay.classList.remove('active');
        }
      };
    }

    function toast(msg) {
      const div = document.createElement('div');
      div.style.cssText =
        'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#121a2b;border:2px solid var(--border);padding:.6rem 1rem;color:#fff;z-index:9999';
      div.textContent = msg;
      document.body.appendChild(div);
      setTimeout(() => div.remove(), 1500);
    }

    function progressBar(pct) {
      const safe = Math.max(0, Math.min(100, pct));
      return `
        <div style="height:8px;background:#0e1526;border:1px solid var(--border);margin-top:.35rem">
          <div style="height:100%;width:${safe}%;background:var(--accent)"></div>
        </div>`;
    }

    function formatDuration(sec) {
      let value = Math.max(0, Math.floor(sec || 0));
      const days = Math.floor(value / 86400);
      const hours = Math.floor((value % 86400) / 3600);
      const minutes = Math.floor((value % 3600) / 60);
      const seconds = value % 60;
      const parts = [];
      if (days) parts.push(`${days}d`);
      if (hours || parts.length) parts.push(`${hours}t`);
      if (minutes || parts.length) parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);
      return parts.join(' ');
    }

    function todayKey() {
      const d = new Date();
      return d.toISOString().slice(0, 10);
    }

    function isTodayHalloween() {
      if (FORCE_HALLOWEEN) return true;
      const now = new Date();
      return now.getMonth() === 9 && now.getDate() === 31;
    }

    const IS_HALLOWEEN = isTodayHalloween();
    const HALLOWEEN_KEY = `halloween_${new Date().getFullYear()}`;

    if (IS_HALLOWEEN) {
      document.body.classList.add('halloween');
      if (banner) banner.style.display = 'block';
      if (bonusVal) bonusVal.textContent = '+10';
      if (dailyTip) dailyTip.textContent = 'Halloween-bonus! Ekstra coins i dag 🎃';
      if (openHQuestsBtn) openHQuestsBtn.style.display = 'block';
      if (newsList && !newsList.dataset.halloweenAdded) {
        const li = document.createElement('li');
        li.textContent = '🎃 Halloween-event live: gresskar-rute, quests og ekstra bonus!';
        newsList.prepend(li);
        newsList.dataset.halloweenAdded = 'true';
        halloweenNewsItem = li;
      }
    }

    const LS_BONUS_DATE = 'hogsiteDailyDate';
    const LS_STREAK = 'hogsiteStreak';

    function canClaim() {
      return localStorage.getItem(LS_BONUS_DATE) !== todayKey();
    }

    let userRef = null;
    let currentUser = null;
    let coinsCache = 0;
    let achCache = {};
    let itemsCache = {};
    let questCache = {};
    let playSeconds = 0;
    let gamesPlayed = 0;
    let lifetimeCoinsEarned = 0;
    let maxCoinsEver = 0;
    let authUnsub = null;

    const ACH_LIST = [
      { id: 'both_gold_bad', name: 'Yin & Yang', desc: 'Få både GULL og DÅRLIG i ett Tusks-spill.' },
      { id: 'perfect_9_plus_gold', name: 'Perfekt Tusk', desc: 'Få alle 9 tusks og 1 gull i ett spill.' },
      { id: 'gold_early', name: 'Gull Tidlig', desc: 'Få GULL innen de 3 første klikkene.' },
      { id: 'bad_last_click', name: 'Au, helt sist!', desc: 'Få DÅRLIG på siste klikk i runden.' },
      { id: 'tusk_streak5', name: 'Tusk-kombinasjon', desc: 'Treff 5 vanlige tusks på rad uten Tom/Dårlig.' },
      { id: 'exact_67', name: '67', desc: 'Ha nøyaktig 67 coins.' },
      { id: 'halloween_spirit', name: 'Halloween Spirit', desc: 'Spill på Halloween 🎃' },
      { id: 'pumpkin_master', name: 'Gresskar-mester', desc: 'Finn gresskar-ruten på Halloween.' },
    ];

    function updateInventoryCount() {
      const total = Object.values(itemsCache).reduce((a, b) => a + (+b || 0), 0);
      const invCount = document.getElementById('invCount');
      if (invCount) invCount.textContent = String(total);
    }

    function updateAchCount() {
      const count = Object.values(achCache).filter(Boolean).length;
      const achCount = document.getElementById('achCount');
      if (achCount) achCount.textContent = `${count}/8`;
    }

    function setCoinsLocalDisplay(value) {
      coinsCache = value;
      if (coinsVal) coinsVal.textContent = String(value);
      if (value === 67) awardAch('exact_67');
    }

    function awardAch(id) {
      if (achCache[id]) return;
      achCache[id] = true;
      updateAchCount();
      toast(`🏆 Achievement: ${ACH_LIST.find((x) => x.id === id)?.name || id}`);
      if (userRef) updateDoc(userRef, { [`ach.${id}`]: true, updatedAt: serverTimestamp() }).catch(console.error);
    }

    if (IS_HALLOWEEN) awardAch('halloween_spirit');

    async function ensureUserDoc(uid) {
      userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          coins: 50,
          name: '',
          ach: {},
          items: {},
          quests: {},
          streak: 0,
          playSeconds: 0,
          gamesPlayed: 0,
          lifetimeCoinsEarned: 0,
          maxCoinsEver: 50,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      onSnapshot(userRef, (docSnap) => {
        const data = docSnap.data() || {};
        setCoinsLocalDisplay(Number(data.coins || 0));
        achCache = data.ach || {};
        itemsCache = data.items || {};
        questCache = data.quests || {};
        playSeconds = Number(data.playSeconds || 0);
        gamesPlayed = Number(data.gamesPlayed || 0);
        lifetimeCoinsEarned = Number(data.lifetimeCoinsEarned || 0);
        maxCoinsEver = Number(data.maxCoinsEver || 0);
        if (streakVal) streakVal.textContent = String(Number(data.streak || 0));
        updateAchCount();
        updateInventoryCount();
        const uidText = document.getElementById('uidText');
        if (uidText) uidText.textContent = `ID: ${uid}`;
        if (playBtn) playBtn.disabled = false;
        if (playAutoBtn) playAutoBtn.disabled = false;
      });
    }

    async function addCoinsTracked(delta) {
      if (!userRef) return;
      setCoinsLocalDisplay(coinsCache + delta);
      if (delta > 0) lifetimeCoinsEarned += delta;
      maxCoinsEver = Math.max(maxCoinsEver, coinsCache);
      await updateDoc(userRef, {
        coins: increment(delta),
        lifetimeCoinsEarned: delta > 0 ? increment(delta) : increment(0),
        maxCoinsEver: Math.max(maxCoinsEver, coinsCache),
        updatedAt: serverTimestamp(),
      }).catch(console.error);
    }

    async function addItem(name, qty = 1) {
      const newQty = Number(itemsCache[name] || 0) + qty;
      itemsCache[name] = newQty;
      updateInventoryCount();
      if (userRef) await updateDoc(userRef, { [`items.${name}`]: newQty, updatedAt: serverTimestamp() }).catch(console.error);
    }

    async function setUserName(name) {
      const trimmed = (name || '').trim();
      if (!userRef) return;
      await updateDoc(userRef, { name: trimmed, updatedAt: serverTimestamp() });
      try {
        if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: trimmed });
      } catch (error) {
        console.error(error);
      }
    }

    function updateDailyButtons() {
      const disabled = !canClaim();
      const buttons = [document.getElementById('dailyBtn'), document.getElementById('dailyBtnSide')];
      buttons.forEach((btn) => {
        if (!btn) return;
        btn.classList.toggle('disabled', disabled);
        btn.disabled = disabled;
      });
    }

    async function claimDaily() {
      if (!canClaim()) {
        toast('Du har allerede hentet dagens bonus.');
        return;
      }
      const last = localStorage.getItem(LS_BONUS_DATE);
      let newStreak = 0;
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      if (last === yest.toISOString().slice(0, 10)) {
        newStreak = (parseInt(localStorage.getItem(LS_STREAK), 10) || 0) + 1;
      } else {
        newStreak = 1;
      }
      localStorage.setItem(LS_STREAK, String(newStreak));
      localStorage.setItem(LS_BONUS_DATE, todayKey());
      if (userRef) await updateDoc(userRef, { streak: newStreak, updatedAt: serverTimestamp() });
      await addCoinsTracked(IS_HALLOWEEN ? +10 : +3);
      toast(`Bonus ${IS_HALLOWEEN ? '+10' : '+3'} coins!`);
      updateDailyButtons();
    }

    updateDailyButtons();
    on(document.getElementById('dailyBtn'), 'click', claimDaily);
    on(document.getElementById('dailyBtnSide'), 'click', claimDaily);

    function openInventory() {
      const keys = Object.keys(itemsCache);
      const list = keys.length
        ? keys.map((k) => `<li><strong>${k}</strong> × ${itemsCache[k]}</li>`).join('')
        : '<li>Ingen items enda.</li>';
      openModal(
        'Inventory',
        `<p>Items du har samlet:</p><ul style="margin:.6rem 0 .2rem 1rem;line-height:1.6">${list}</ul>`
      );
    }

    function renderAchievements() {
      const list = ACH_LIST.map((ach) => {
        const ok = !!achCache[ach.id];
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;border:2px solid var(--border);background:${
            ok ? '#12201a' : '#101523'
          };padding:.6rem;margin-bottom:.4rem">
            <div>
              <strong>${ach.name}</strong>
              <div style="color:var(--muted);font-size:.9rem">${ach.desc}</div>
            </div>
            <div class="pill" style="border:2px solid ${ok ? '#2fbf71' : 'var(--border)'};padding:.2rem .5rem;color:#fff">${
              ok ? 'Fullført' : 'Låst'
            }</div>
          </div>`;
      }).join('');
      openModal('Achievements', list);
    }

    async function openProfile() {
      const uid = auth.currentUser?.uid || '...';
      const snap = currentUser ? await getDoc(doc(db, 'users', uid)) : null;
      const data = snap?.data() || {};
      const name = data?.name || '';
      const stats = {
        coins: Number(data?.coins || 0),
        streak: Number(data?.streak || 0),
        playSeconds: Number(data?.playSeconds || 0),
        gamesPlayed: Number(data?.gamesPlayed || 0),
        lifetimeCoinsEarned: Number(data?.lifetimeCoinsEarned || 0),
        maxCoinsEver: Number(data?.maxCoinsEver || 0),
      };

      openModal(
        'Profil',
        `
        <p style="margin-bottom:.6rem">Din unike ID: <code>${uid}</code></p>
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem">
          <input id="nameInput" class="input" style="flex:1;border:2px solid var(--border);background:#0f1320;color:#fff;padding:.5rem" placeholder="Brukernavn" value="${name}">
          <button class="btn primary" id="saveName">Lagre</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem">
          <div style="border:2px solid var(--border);background:var(--panel-2);padding:.7rem">
            <div style="color:var(--muted)">Coins (nå)</div><div style="font-weight:800">${stats.coins}</div>
          </div>
          <div style="border:2px solid var(--border);background:var(--panel-2);padding:.7rem">
            <div style="color:var(--muted)">Streak</div><div style="font-weight:800">${stats.streak}</div>
          </div>
          <div style="border:2px solid var(--border);background:var(--panel-2);padding:.7rem">
            <div style="color:var(--muted)">Tid spilt</div><div style="font-weight:800" title="${stats.playSeconds} sek">${formatDuration(
              stats.playSeconds
            )}</div>
          </div>
          <div style="border:2px solid var(--border);background:var(--panel-2);padding:.7rem">
            <div style="color:var(--muted)">Spill spilt</div><div style="font-weight:800">${stats.gamesPlayed}</div>
          </div>
          <div style="border:2px solid var(--border);background:var(--panel-2);padding:.7rem">
            <div style="color:var(--muted)">Totalt tjent coins</div><div style="font-weight:800">${stats.lifetimeCoinsEarned}</div>
          </div>
          <div style="border:2px solid var(--border);background:var(--panel-2);padding:.7rem">
            <div style="color:var(--muted)">Maks coins (rekord)</div><div style="font-weight:800">${stats.maxCoinsEver}</div>
          </div>
        </div>
      `
      );

      const saveBtn = document.getElementById('saveName');
      if (saveBtn) {
        saveBtn.onclick = async () => {
          const value = document.getElementById('nameInput')?.value || '';
          await setUserName(value);
          overlay.classList.remove('active');
          toast('Brukernavn oppdatert.');
        };
      }
    }

    on(document.getElementById('openInventory'), 'click', openInventory);
    on(document.getElementById('openAchievements'), 'click', renderAchievements);
    on(document.getElementById('openProfile'), 'click', openProfile);
    const editName = document.getElementById('editName');
    if (editName) {
      editName.onclick = () => document.getElementById('openProfile')?.click();
      cleanupFns.push(() => {
        editName.onclick = null;
      });
    }

    const uidText = document.getElementById('uidText');
    if (uidText) uidText.textContent = 'ID: (logger inn …)';

    const copyUidBtn = document.getElementById('copyUid');
    if (copyUidBtn) {
      copyUidBtn.onclick = async () => {
        const id = auth.currentUser?.uid || '...';
        await navigator.clipboard.writeText(id);
        toast('Din ID er kopiert.');
      };
      cleanupFns.push(() => {
        copyUidBtn.onclick = null;
      });
    }

    function updateArrows() {
      const rowEl = document.getElementById('gamesRow');
      const leftBtn = document.getElementById('leftBtn');
      const rightBtn = document.getElementById('rightBtn');
      if (!rowEl || !leftBtn || !rightBtn) return;
      const max = rowEl.scrollWidth - rowEl.clientWidth;
      const disabled = max <= 0;
      [leftBtn, rightBtn].forEach((btn) => {
        btn.classList.toggle('disabled', disabled);
        btn.disabled = disabled;
      });
    }

    const rowEl = document.getElementById('gamesRow');
    const leftBtn = document.getElementById('leftBtn');
    const rightBtn = document.getElementById('rightBtn');
    updateArrows();
    on(leftBtn, 'click', () => rowEl?.scrollBy({ left: -260, behavior: 'smooth' }));
    on(rightBtn, 'click', () => rowEl?.scrollBy({ left: 260, behavior: 'smooth' }));

    async function openLeaderboard() {
      openModal(
        'Leaderboard',
        `
        <div class="lb-wrap">
          <table class="lb-table">
            <thead>
              <tr>
                <th>#</th><th>Spiller</th><th>Coins</th><th>Streak</th><th>Tid spilt</th><th>Spill spilt</th>
              </tr>
            </thead>
            <tbody id="lbBody">
              <tr><td colspan="6" style="padding:.6rem;color:var(--muted)">Laster …</td></tr>
            </tbody>
          </table>
        </div>
      `
      );

      const bodyEl = document.getElementById('lbBody');
      if (window._lbUnsub) window._lbUnsub();

      const q = query(collection(db, 'users'), orderBy('coins', 'desc'), limit(500));
      window._lbUnsub = onSnapshot(q, (snapshot) => {
        const arr = [];
        snapshot.forEach((d) => {
          const data = d.data() || {};
          arr.push({
            id: d.id,
            name: (data.name || '').trim() || d.id,
            coins: Number(data.coins || 0),
            streak: Number(data.streak || 0),
            playSeconds: Number(data.playSeconds || 0),
            gamesPlayed: Number(data.gamesPlayed || 0),
          });
        });
        arr.sort((a, b) => b.coins - a.coins);
        const rows = arr
          .map(
            (x, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${x.name}</td>
            <td>${x.coins}</td>
            <td>${x.streak}</td>
            <td title="${x.playSeconds} sek">${formatDuration(x.playSeconds)}</td>
            <td>${x.gamesPlayed}</td>
          </tr>`
          )
          .join('');
        if (bodyEl) {
          bodyEl.innerHTML =
            rows || `<tr><td colspan="6" style="padding:.6rem;color:var(--muted)">Ingen spillere enda.</td></tr>`;
        }
      });
    }

    const openBoard = document.getElementById('openBoard');
    if (openBoard) {
      openBoard.onclick = (e) => {
        e.preventDefault();
        openLeaderboard();
      };
      cleanupFns.push(() => {
        openBoard.onclick = null;
      });
    }

    on(document.getElementById('openHQuests'), 'click', () => renderHalloweenQuests());

    async function inc(path, delta) {
      if (!userRef) return;
      await updateDoc(userRef, { [path]: increment(delta), updatedAt: serverTimestamp() });
    }

    async function setTrue(path) {
      if (!userRef) return;
      await updateDoc(userRef, { [path]: true, updatedAt: serverTimestamp() });
    }

    async function initHalloweenQuests() {
      const init = {
        date: todayKey(),
        q1: { count: 0, target: 1, done: false, claimed: false },
        q2: { done: false, claimed: false },
        q3: { count: 0, target: 3, done: false, claimed: false },
        grandClaimed: false,
      };
      questCache[HALLOWEEN_KEY] = init;
      if (userRef) await updateDoc(userRef, { [`quests.${HALLOWEEN_KEY}`]: init, updatedAt: serverTimestamp() });
    }

    function renderHalloweenQuests() {
      if (!IS_HALLOWEEN) {
        toast('Halloween Quests er kun tilgjengelig på Halloween.');
        return;
      }
      const q =
        questCache[HALLOWEEN_KEY] || {
          q1: { count: 0, target: 1, done: false, claimed: false },
          q2: { done: false, claimed: false },
          q3: { count: 0, target: 3, done: false, claimed: false },
          grandClaimed: false,
        };

      const card = (title, desc, key, rewardHtml) => {
        const node = q[key] || {};
        const done = !!node.done;
        const claimed = !!node.claimed;
        let right = '';
        if (node.target) {
          const c = Number(node.count || 0);
          const t = Number(node.target || 1);
          const pct = Math.round((c / t) * 100);
          right = `
            <div style="text-align:right;min-width:140px">
              <div style="font-size:.9rem">${c}/${t}</div>
              ${progressBar(pct)}
            </div>`;
        } else {
          right = `<span class="pill" style="border:2px solid ${done ? '#2fbf71' : 'var(--border)'};padding:.15rem .5rem;margin-right:.4rem">${
            done ? 'Ferdig' : '0%'
          }</span>`;
        }
        return `
          <div style="border:2px solid var(--border);background:var(--panel-2);padding:.8rem;margin-bottom:.6rem">
            <div style="display:flex;gap:.8rem;align-items:center;justify-content:space-between">
              <div style="flex:1">
                <strong>${title}</strong>
                <div style="color:var(--muted);font-size:.92rem">${desc}</div>
                <div style="margin-top:.3rem;font-size:.9rem">Belønning: ${rewardHtml}</div>
              </div>
              <div style="display:flex;gap:.5rem;align-items:center">
                ${right}
                <button class="btn ${!done || claimed ? 'disabled' : ''}" data-claim="${key}">${
          claimed ? 'Claimet' : 'Claim'
        }</button>
              </div>
            </div>
          </div>`;
      };

      const allClaimed = q.q1?.claimed && q.q2?.claimed && q.q3?.claimed;
      const canGrand = allClaimed && !q.grandClaimed;

      openModal(
        '🎃 Halloween Quests',
        `
        ${card('Varm opp', 'Spill 1 runde Tusks i dag.', 'q1', '<strong>+3</strong> coins')}
        ${card('Tusk-mester', 'Få <strong>7+</strong> TUSK i <em>én</em> runde.', 'q2', '<strong>+5</strong> coins')}
        ${card('Gresskarjakt', 'Finn <strong>Gresskar</strong>-ruten <strong>3</strong> ganger.', 'q3', '<strong>Gresskar ×1–3</strong>')}
        <div style="border:2px dashed var(--border);background:transparent;padding:.8rem">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>Stor belønning</strong>
              <div style="color:var(--muted);font-size:.92rem">Claim alle 3 quests for å få <strong>Gull Gresskar</strong>.</div>
            </div>
            <button class="btn ${canGrand ? '' : 'disabled'}" id="grandClaim">${
          q.grandClaimed ? 'Claimet' : 'Claim Gull Gresskar'
        }</button>
          </div>
        </div>
      `
      );

      overlay.querySelectorAll('[data-claim]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const key = btn.getAttribute('data-claim');
          await claimQuest(key);
          renderHalloweenQuests();
        });
      });
      const grandBtn = document.getElementById('grandClaim');
      if (grandBtn) {
        grandBtn.onclick = async () => {
          const qc = questCache[HALLOWEEN_KEY];
          if (!(qc && qc.q1?.claimed && qc.q2?.claimed && qc.q3?.claimed) || qc.grandClaimed) return;
          await addItem('Gull Gresskar', 1);
          qc.grandClaimed = true;
          await updateDoc(userRef, { [`quests.${HALLOWEEN_KEY}.grandClaimed`]: true, updatedAt: serverTimestamp() });
          toast('🎃 Stor belønning: Gull Gresskar!');
          renderHalloweenQuests();
        };
      }
    }

    async function claimQuest(key) {
      if (!IS_HALLOWEEN) return;
      let q = questCache[HALLOWEEN_KEY];
      if (!q) {
        await initHalloweenQuests();
        q = questCache[HALLOWEEN_KEY];
      }
      const node = q[key] || {};
      if (!node.done || node.claimed) return;

      if (key === 'q1') await addCoinsTracked(+3);
      if (key === 'q2') await addCoinsTracked(+5);
      if (key === 'q3') {
        const qty = 1 + Math.floor(Math.random() * 3);
        await addItem('Gresskar', qty);
      }

      node.claimed = true;
      await updateDoc(userRef, { [`quests.${HALLOWEEN_KEY}.${key}.claimed`]: true, updatedAt: serverTimestamp() });
      toast('Belønning claimet!');
    }

    async function markQ1Played() {
      if (!IS_HALLOWEEN) return;
      let q = questCache[HALLOWEEN_KEY];
      if (!q) {
        await initHalloweenQuests();
        q = questCache[HALLOWEEN_KEY];
      }
      await inc(`quests.${HALLOWEEN_KEY}.q1.count`, 1);
      const after = (questCache[HALLOWEEN_KEY]?.q1?.count || 0) + 1;
      if (after >= (questCache[HALLOWEEN_KEY]?.q1?.target || 1)) {
        await setTrue(`quests.${HALLOWEEN_KEY}.q1.done`);
      }
    }

    async function markQ2Tusks7() {
      if (!IS_HALLOWEEN) return;
      let q = questCache[HALLOWEEN_KEY];
      if (!q) {
        await initHalloweenQuests();
        q = questCache[HALLOWEEN_KEY];
      }
      if (q.q2?.done) return;
      await setTrue(`quests.${HALLOWEEN_KEY}.q2.done`);
    }

    async function markQ3PumpkinFound() {
      if (!IS_HALLOWEEN) return;
      let q = questCache[HALLOWEEN_KEY];
      if (!q) {
        await initHalloweenQuests();
        q = questCache[HALLOWEEN_KEY];
      }
      await inc(`quests.${HALLOWEEN_KEY}.q3.count`, 1);
      const after = (questCache[HALLOWEEN_KEY]?.q3?.count || 0) + 1;
      const target = questCache[HALLOWEEN_KEY]?.q3?.target || 3;
      if (after >= target) {
        await setTrue(`quests.${HALLOWEEN_KEY}.q3.done`);
      }
    }

    function startAutoLoop(revealFn) {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
      autoTimer = setInterval(() => {
        if (!revealFn()) {
          clearInterval(autoTimer);
          autoTimer = null;
        }
      }, 1000);
    }

    function setupTusksButtons(startTusks) {
      if (playBtn) {
        const handler = () => startTusks(false);
        playBtn.addEventListener('click', handler);
        cleanupFns.push(() => playBtn.removeEventListener('click', handler));
      }
      if (playAutoBtn) {
        const handler = () => {
          autoMode = !autoMode;
          updateAutoBtnTexts();
          if (autoMode) {
            startTusks(true, { forceHeadless: true });
          } else {
            stopAuto();
          }
        };
        playAutoBtn.addEventListener('click', handler);
        cleanupFns.push(() => playAutoBtn.removeEventListener('click', handler));
      }
      if (autoToggleBtn) {
        const handler = () => {
          autoMode = !autoMode;
          updateAutoBtnTexts();
          if (autoMode) startTusks(true, { forceHeadless: true });
          else stopAuto();
        };
        autoToggleBtn.addEventListener('click', handler);
        cleanupFns.push(() => autoToggleBtn.removeEventListener('click', handler));
      }
      updateAutoBtnTexts();
    }

    async function startTusks(startInAuto, { forceHeadless = false } = {}) {
      if (!userRef) {
        toast('Laster profil … prøv igjen om 1 sekund.');
        return;
      }
      if (startInAuto) {
        autoMode = true;
        updateAutoBtnTexts();
      }
      if (IS_HALLOWEEN) awardAch('halloween_spirit');
      if (IS_HALLOWEEN) markQ1Played();

      const gameStart = Date.now();

      const showUI = !forceHeadless && (!autoMode || overlay.classList.contains('active'));
      openModal(
        'Tusks',
        `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.6rem">
          <div>Forsøk igjen: <strong id="tries">10</strong></div>
          <div id="autoStatus" style="font-size:.9rem;color:${
            autoMode ? 'var(--accent-2)' : 'var(--muted)'
          }">${autoMode ? '🤖 Autospill aktiv (1 klikk/sek)' : '—'}</div>
        </div>
        <div class="game-grid" id="grid"></div>
        <div class="status">${
          IS_HALLOWEEN
            ? 'Vanlig +1 • Gull +5 • Dårlig −3 • Tom 0 • 🎃 Gresskar: items!'
            : 'Vanlig +1 • Gull +5 • Dårlig −3 • Tom 0'
        }</div>
        <div style="margin-top:.6rem;display:flex;gap:.5rem">
          <button class="btn" id="toggleAuto">${autoMode ? '⏹️ Stopp autospill' : '🤖 Start autospill'}</button>
        </div>
      `,
        { show: showUI }
      );

      const grid = document.getElementById('grid');
      const triesEl = document.getElementById('tries');
      const toggleAutoBtn = document.getElementById('toggleAuto');
      const autoStatus = document.getElementById('autoStatus');

      const idx = Array.from({ length: 16 }, (_, i) => i).sort(() => Math.random() - 0.5);
      const tusks = new Set(idx.slice(0, 9));
      const gold = idx[9];
      const bad = idx[10];
      const pumpkin = IS_HALLOWEEN ? idx[11] : null;

      const CLICKABLE_COUNT = IS_HALLOWEEN ? 12 : 11;

      let tries = 10;
      const revealed = Array(16).fill(false);
      let revealedNonEmpty = 0;
      let foundGold = false;
      let foundBad = false;
      let badOnLast = false;
      let tuskCombo = 0;
      let maxTuskCombo = 0;
      let goldClickNo = Infinity;
      let tuskCount = 0;
      let foundPumpkin = false;

      if (grid) {
        grid.innerHTML = '';
        for (let i = 0; i < 16; i += 1) {
          const tile = document.createElement('div');
          tile.className = 'tile';
          tile.addEventListener('click', () => reveal(i, tile));
          grid.appendChild(tile);
        }
      }

      if (toggleAutoBtn) {
        toggleAutoBtn.onclick = () => {
          autoMode = !autoMode;
          updateAutoBtnTexts();
          if (autoStatus) {
            autoStatus.textContent = autoMode ? '🤖 Autospill aktiv (1 klikk/sek)' : '—';
            autoStatus.style.color = autoMode ? 'var(--accent-2)' : 'var(--muted)';
          }
          if (autoMode) startAutoLoop(stepReveal);
          else if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
          }
          updateAutoBtnTexts();
        };
      }

      function finishAndSave() {
        const elapsed = Math.round((Date.now() - gameStart) / 1000);
        if (!userRef) return;
        updateDoc(userRef, {
          gamesPlayed: increment(1),
          playSeconds: increment(elapsed),
          updatedAt: serverTimestamp(),
        }).catch(console.error);
      }

      function dropRewards() {
        const drops = [];
        const rand = () => Math.random() < 1 / 3;
        if (tuskCount > 0 && rand()) {
          addItem('Tusk', 1);
          drops.push('Tusk');
        }
        if (foundGold && rand()) {
          addItem('Gull Tusk', 1);
          drops.push('Gull Tusk');
        }
        if (foundBad && rand()) {
          addItem('Ond Tusk', 1);
          drops.push('Ond Tusk');
        }
        if (IS_HALLOWEEN && foundPumpkin) {
          const qty = 1 + Math.floor(Math.random() * 5);
          addItem('Gresskar', qty);
          drops.push(`Gresskar × ${qty}`);
          awardAch('pumpkin_master');
        }
        return drops;
      }

      function reveal(i, tileEl) {
        if (revealed[i] || tries <= 0) return;
        revealed[i] = true;
        tries -= 1;
        if (triesEl) triesEl.textContent = String(tries);

        if (IS_HALLOWEEN && i === pumpkin) {
          if (tileEl) {
            tileEl.classList.add('pumpkin');
            tileEl.textContent = '🎃';
          }
          revealedNonEmpty += 1;
          foundPumpkin = true;
          tuskCombo = 0;
        } else if (i === gold) {
          if (tileEl) {
            tileEl.classList.add('gold');
            tileEl.textContent = 'GULL';
          }
          addCoinsTracked(+5);
          revealedNonEmpty += 1;
          foundGold = true;
          goldClickNo = Math.min(goldClickNo, 10 - tries);
          tuskCombo = 0;
        } else if (i === bad) {
          if (tileEl) {
            tileEl.classList.add('bad');
            tileEl.textContent = 'DÅRLIG';
          }
          addCoinsTracked(-3);
          revealedNonEmpty += 1;
          foundBad = true;
          tuskCombo = 0;
          badOnLast = tries === 0;
        } else if (tusks.has(i)) {
          if (tileEl) {
            tileEl.classList.add('revealed');
            tileEl.textContent = 'TUSK';
          }
          addCoinsTracked(+1);
          revealedNonEmpty += 1;
          tuskCount += 1;
          tuskCombo += 1;
          if (tuskCombo > maxTuskCombo) maxTuskCombo = tuskCombo;
        } else {
          if (tileEl) {
            tileEl.classList.add('empty');
            tileEl.textContent = 'TOM';
          }
          tuskCombo = 0;
        }

        if (i === bad && tries === 0) badOnLast = true;
        if (tries === 0 || revealedNonEmpty === CLICKABLE_COUNT) endGame();
      }

      function endGame() {
        if (autoTimer) {
          clearInterval(autoTimer);
          autoTimer = null;
        }

        if (foundGold && foundBad) awardAch('both_gold_bad');
        if (tuskCount === 9 && foundGold) awardAch('perfect_9_plus_gold');
        if (goldClickNo <= 3) awardAch('gold_early');
        if (badOnLast) awardAch('bad_last_click');
        if (maxTuskCombo >= 5) awardAch('tusk_streak5');

        if (IS_HALLOWEEN && tuskCount >= 7) markQ2Tusks7();
        if (IS_HALLOWEEN && foundPumpkin) markQ3PumpkinFound();

        const drops = dropRewards();
        finishAndSave();

        if (autoMode) {
          setTimeout(() => startTusks(true, { forceHeadless: !overlay.classList.contains('active') }), 400);
        } else {
          openModal(
            'Runden er ferdig',
            `
            <p style="margin-bottom:.6rem">Stats oppdatert i skyen.</p>
            <ul style="margin:.4rem 0 .8rem 1rem;line-height:1.5">
              <li>Tusks funnet: <strong>${tuskCount}</strong> / 9</li>
              <li>Gull funnet: <strong>${foundGold ? 'Ja' : 'Nei'}</strong></li>
              <li>Dårlig truffet: <strong>${foundBad ? 'Ja' : 'Nei'}</strong></li>
              ${IS_HALLOWEEN ? `<li>Gresskar funnet: <strong>${foundPumpkin ? 'Ja' : 'Nei'}</strong></li>` : ''}
              <li>Drops: <strong>${drops.length ? drops.join(', ') : 'Ingen'}</strong></li>
            </ul>
            <div style="display:flex;gap:.6rem;flex-wrap:wrap">
              <button class="btn primary" id="replay">Spill igjen</button>
              <button class="btn" id="closeRes">Lukk</button>
            </div>
          `
          );
          const replay = document.getElementById('replay');
          if (replay) replay.onclick = () => startTusks(false);
          const closeRes = document.getElementById('closeRes');
          if (closeRes) closeRes.onclick = () => overlay.classList.remove('active');
        }
      }

      function stepReveal() {
        if (tries <= 0) return false;
        const candidates = [];
        for (let k = 0; k < 16; k += 1) {
          if (!revealed[k]) candidates.push(k);
        }
        if (candidates.length === 0) return false;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const tile = grid ? grid.children[pick] : null;
        reveal(pick, tile);
        if (tries <= 0) return false;
        return true;
      }

      if (autoMode) startAutoLoop(stepReveal);
    }

    setupTusksButtons(startTusks);

    if (IS_HALLOWEEN && openHQuestsBtn) openHQuestsBtn.style.display = 'block';

    if (!auth.currentUser) {
      signInAnonymously(auth).catch(console.error);
    }
    authUnsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      currentUser = user;
      await ensureUserDoc(user.uid);
      if (IS_HALLOWEEN && !questCache[HALLOWEEN_KEY]) await initHalloweenQuests();
      if (IS_HALLOWEEN && openHQuestsBtn) openHQuestsBtn.style.display = 'block';
    });

    return () => {
      stopAuto();
      cleanupFns.forEach((fn) => fn());
      if (authUnsub) authUnsub();
      if (window._lbUnsub) {
        window._lbUnsub();
        window._lbUnsub = null;
      }
      if (IS_HALLOWEEN) {
        document.body.classList.remove('halloween');
        if (banner) banner.style.display = originalBannerDisplay;
        if (bonusVal) bonusVal.textContent = originalBonusText;
        if (dailyTip) dailyTip.textContent = originalDailyTip;
        if (halloweenNewsItem && halloweenNewsItem.parentElement) {
          halloweenNewsItem.remove();
        }
        if (newsList && newsList.dataset.halloweenAdded) {
          delete newsList.dataset.halloweenAdded;
        }
      }
      if (openHQuestsBtn) openHQuestsBtn.style.display = 'none';
    };
  }, []);
}
