/* auction.js — полный рабочий модуль аукционов
   Функции:
   - loadAuctions() — отображает текущие аукционы
   - createAuction() — создаёт аукцион (eggs, startPrice, durationMinutes)
   - placeBid(auctionId, bidAmount) — ставит ставку
   - cancelAuction(auctionId) — отмена аукциона (только продавец, если нет ставок)
   - finalizeEndedAuctions() — автоматически завершает аукционы по таймеру
   Зависимости: window.db, window.userId, window.notify, window.saveGame, window.updateUI
*/

(function () {
  const auctionsRef = window.db ? window.db.ref("auctions") : null;
  const usersRef = window.db ? window.db.ref("users") : null;
  const FEE_RATE = 0.05; // комиссия платформы 5%
  const MIN_BID_INCREMENT = 0.01; // минимальный шаг ставки в TON

  function safeNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function formatTon(n) {
    return Number(n).toFixed(3);
  }

  function createElementFromHTML(html) {
    const div = document.createElement('div');
    div.innerHTML = html.trim();
    return div.firstChild;
  }

  // Рендер списка аукционов
  function renderAuctions(items) {
    const container = document.getElementById("auctionList");
    if (!container) return;
    container.innerHTML = "";
    if (!items || items.length === 0) {
      container.innerHTML = "<div class='small'>Пока нет аукционов</div>";
      return;
    }

    items.forEach(item => {
      const highest = item.highestBid || { amount: 0, bidder: null };
      const endsIn = Math.max(0, item.endTime - Date.now());
      const minutes = Math.floor(endsIn / 60000);
      const seconds = Math.floor((endsIn % 60000) / 1000);
      const timeText = endsIn > 0 ? `${minutes}m ${seconds}s` : "Завершён";

      const html = `
        <div class="auction-item" style="border:3px solid #000;padding:8px;margin-bottom:8px;background:#0b0b0b;border-radius:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:12px;"><b>${item.eggs}</b> яиц</div>
            <div style="font-size:12px;">Текущая: <b>${formatTon(highest.amount || item.startPrice)}</b> TON</div>
          </div>
          <div style="font-size:11px;margin-top:6px;color:#ccc;">
            Продавец: ${item.userId === window.userId ? "Вы" : item.userId} • Окончание: ${timeText}
          </div>
          <div class="auction-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;"></div>
        </div>
      `;
      const node = createElementFromHTML(html);
      const actions = node.querySelector('.auction-actions');

      const bidInput = document.createElement("input");
      bidInput.type = "number";
      bidInput.placeholder = "Ставка TON";
      bidInput.style.padding = "6px";
      bidInput.style.border = "3px solid #000";
      bidInput.style.borderRadius = "6px";
      bidInput.style.background = "#0b0b0b";
      bidInput.style.color = "#fff";
      bidInput.style.width = "120px";
      bidInput.style.fontSize = "12px";

      const bidBtn = document.createElement("button");
      bidBtn.className = "pixel-btn small-btn";
      bidBtn.innerText = "Сделать ставку";
      bidBtn.onclick = () => {
        const val = Number(bidInput.value);
        placeBid(item.id, val);
      };

      actions.appendChild(bidInput);
      actions.appendChild(bidBtn);

      if (item.userId === window.userId) {
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "pixel-btn small-btn";
        cancelBtn.innerText = "Отменить";
        cancelBtn.onclick = () => cancelAuction(item.id);
        actions.appendChild(cancelBtn);
      }

      container.appendChild(node);
    });
  }

  // Загрузка аукционов
  function loadAuctions() {
    if (!auctionsRef) return;
    auctionsRef.on("value", snap => {
      const arr = [];
      snap.forEach(child => {
        const val = child.val();
        arr.push({
          id: child.key,
          userId: val.userId,
          eggs: safeNumber(val.eggs),
          startPrice: safeNumber(val.startPrice),
          highestBid: val.highestBid || null,
          endTime: val.endTime || 0,
          time: val.time || 0
        });
      });
      arr.sort((a, b) => a.endTime - b.endTime);
      renderAuctions(arr);
    });
  }

  // Создать аукцион
  async function createAuction() {
    const eggsInput = document.getElementById("auctionEggs");
    const priceInput = document.getElementById("auctionPrice");
    if (!eggsInput || !priceInput) { window.notify?.("❌ Форма не найдена"); return; }

    const eggs = Math.floor(safeNumber(eggsInput.value));
    const startPrice = Number(priceInput.value);
    const durationMinutes = 60; // по умолчанию 60 минут

    if (eggs < 100) { window.notify?.("❌ Минимум 100 яиц"); return; }
    if (!Number.isFinite(startPrice) || startPrice <= 0) { window.notify?.("❌ Неверная стартовая цена"); return; }

    const uid = window.userId;
    if (!usersRef) { window.notify?.("❌ DB не готова"); return; }

    try {
      const snap = await usersRef.child(uid).once("value");
      const userData = snap.exists() ? snap.val() : {};
      const userEggs = safeNumber(userData.eggs);

      if (userEggs < eggs) { window.notify?.("❌ У вас недостаточно яиц"); return; }

      // Списываем яйца у продавца
      const txRes = await usersRef.child(uid).child("eggs").transaction(v => {
        const cur = safeNumber(v);
        if (cur < eggs) return; // abort
        return cur - eggs;
      });
      if (txRes.committed === false) { window.notify?.("❌ Не удалось списать яйца"); return; }

      // Создаём аукцион
      if (auctionsRef) {
        await auctionsRef.push({
          userId: uid,
          eggs: eggs,
          startPrice: Number(startPrice),
          highestBid: null,
          time: Date.now(),
          endTime: Date.now() + durationMinutes * 60000
        });
      }

      window.notify?.("✅ Аукцион создан");
      eggsInput.value = "";
      priceInput.value = "";
      window.updateUI?.();
    } catch (e) {
      console.warn("createAuction error", e);
      window.notify?.("❌ Ошибка создания аукциона");
    }
  }

  // Поставить ставку
  async function placeBid(auctionId, bidAmount) {
    if (!auctionsRef || !usersRef) { window.notify?.("❌ DB не готова"); return; }
    const uid = window.userId;
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) { window.notify?.("❌ Неверная ставка"); return; }

    try {
      const snap = await auctionsRef.child(auctionId).once("value");
      if (!snap.exists()) { window.notify?.("❌ Аукцион не найден"); return; }
      const auction = snap.val();

      const now = Date.now();
      if (auction.endTime <= now) { window.notify?.("❌ Аукцион уже завершён"); return; }

      const currentHighest = auction.highestBid ? safeNumber(auction.highestBid.amount) : safeNumber(auction.startPrice);
      const minRequired = Number((currentHighest + MIN_BID_INCREMENT).toFixed(9));
      if (bidAmount < minRequired) { window.notify?.(`❌ Ставка должна быть не меньше ${formatTon(minRequired)} TON`); return; }

      // Проверяем баланс участника
      const userSnap = await usersRef.child(uid).once("value");
      const userData = userSnap.exists() ? userSnap.val() : {};
      const userTon = safeNumber(userData.ton);
      if (userTon < bidAmount) { window.notify?.("❌ Недостаточно TON для ставки"); return; }

      // Списываем