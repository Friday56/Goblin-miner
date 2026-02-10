/* market.js — полный рабочий модуль рынка яиц
   Функции:
   - loadMarket() — загружает и отображает лоты
   - createMarketLot() — создаёт лот (eggs, price)
   - buyMarketLot(lotId) — покупает лот (перевод TON от покупателя продавцу, передача яиц)
   - cancelMarketLot(lotId) — отменяет лот (только владелец)
   Зависимости: window.db, window.userId, window.notify, window.saveGame, window.updateUI
*/

(function () {
  const marketRef = window.db ? window.db.ref("market") : null;
  const usersRef = window.db ? window.db.ref("users") : null;
  const FEE_RATE = 0.05; // комиссия платформы 5%

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

  // Рендер списка лотов
  function renderMarketList(items) {
    const container = document.getElementById("marketList");
    if (!container) return;
    container.innerHTML = "";
    if (!items || items.length === 0) {
      container.innerHTML = "<div class='small'>Пока нет лотов</div>";
      return;
    }

    items.forEach(item => {
      const sellerLabel = (item.userId === window.userId) ? "Вы" : item.userId;
      const html = `
        <div class="market-item" style="border:3px solid #000;padding:8px;margin-bottom:8px;background:#0b0b0b;border-radius:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:12px;"><b>${item.eggs}</b> яиц</div>
            <div style="font-size:12px;">Цена: <b>${formatTon(item.price)}</b> TON</div>
          </div>
          <div style="font-size:11px;margin-top:6px;color:#ccc;">
            Продавец: ${sellerLabel} • Время: ${new Date(item.time).toLocaleString()}
          </div>
          <div class="market-actions" style="margin-top:8px;display:flex;gap:8px;"></div>
        </div>
      `;
      const node = createElementFromHTML(html);
      const actions = node.querySelector('.market-actions');

      if (item.userId !== window.userId) {
        const buyBtn = document.createElement("button");
        buyBtn.className = "pixel-btn small-btn";
        buyBtn.innerText = `Купить (${formatTon(item.price)} TON)`;
        buyBtn.onclick = () => buyMarketLot(item.id);
        actions.appendChild(buyBtn);
      } else {
        const ownerLabel = document.createElement("div");
        ownerLabel.style.fontSize = "11px";
        ownerLabel.style.color = "#ffea8a";
        ownerLabel.innerText = "Ваш лот";
        actions.appendChild(ownerLabel);

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "pixel-btn small-btn";
        cancelBtn.innerText = "Отменить";
        cancelBtn.onclick = () => cancelMarketLot(item.id);
        actions.appendChild(cancelBtn);
      }

      container.appendChild(node);
    });
  }

  // Загрузка лотов из Firebase и сортировка по времени (новые сверху)
  function loadMarket() {
    if (!marketRef) return;
    marketRef.on("value", snap => {
      const arr = [];
      snap.forEach(child => {
        const val = child.val();
        arr.push({
          id: child.key,
          userId: val.userId,
          eggs: safeNumber(val.eggs),
          price: safeNumber(val.price),
          time: val.time || 0
        });
      });
      arr.sort((a, b) => b.time - a.time);
      renderMarketList(arr);
    });
  }

  // Создать лот
  async function createMarketLot() {
    const eggsInput = document.getElementById("marketEggs");
    const priceInput = document.getElementById("marketPrice");
    if (!eggsInput || !priceInput) { window.notify?.("❌ Форма не найдена"); return; }

    const eggs = Math.floor(safeNumber(eggsInput.value));
    const price = Number(priceInput.value);

    if (eggs < 100) { window.notify?.("❌ Минимум 100 яиц"); return; }
    if (!Number.isFinite(price) || price <= 0) { window.notify?.("❌ Неверная цена"); return; }

    const uid = window.userId;
    if (!usersRef) { window.notify?.("❌ DB не готова"); return; }

    try {
      const snap = await usersRef.child(uid).once("value");
      const userData = snap.exists() ? snap.val() : {};
      const userEggs = safeNumber(userData.eggs);

      if (userEggs < eggs) { window.notify?.("❌ У вас недостаточно яиц"); return; }

      // Списываем яйца у продавца (транзакционно)
      const txRes = await usersRef.child(uid).child("eggs").transaction(v => {
        const cur = safeNumber(v);
        if (cur < eggs) return; // abort
        return cur - eggs;
      });

      if (txRes.committed === false) { window.notify?.("❌ Не удалось списать яйца"); return; }

      // Создаём лот
      if (marketRef) {
        await marketRef.push({
          userId: uid,
          eggs: eggs,
          price: Number(price),
          time: Date.now()
        });
      }

      window.notify?.("✅ Лот создан");
      eggsInput.value = "";
      priceInput.value = "";
      window.updateUI?.();
    } catch (e) {
      console.warn("createMarketLot error", e);
      window.notify?.("❌ Ошибка создания лота");
    }
  }

  // Купить лот
  async function buyMarketLot(lotId) {
    if (!marketRef || !usersRef) { window.notify?.("❌ DB не готова"); return; }
    const uid = window.userId;
    try {
      const lotSnap = await marketRef.child(lotId).once("value");
      if (!lotSnap.exists()) { window.notify?.("❌ Лот не найден"); return; }
      const lot = lotSnap.val();
      if (lot.userId === uid) { window.notify?.("❌ Это ваш лот"); return; }

      const price = safeNumber(lot.price);
      const eggs = safeNumber(lot.eggs);
      const sellerId = String(lot.userId);

      // Проверяем баланс покупателя
      const buyerSnap = await usersRef.child(uid).once("value");
      const buyerData = buyerSnap.exists() ? buyerSnap.val() : {};
      const buyerTon = safeNumber(buyerData.ton);

      if (buyerTon < price) { window.notify?.("❌ Недостаточно TON"); return; }

      const fee = Number((price * FEE_RATE).toFixed(9));
      const sellerReceive = Number((price - fee).toFixed(9));

      // Списываем у покупателя транзакционно
      const buyerTx = await usersRef.child(uid).child("ton").transaction(v => {
        const cur = safeNumber(v);
        if (cur < price) return; // abort
        return Number((cur - price).toFixed(9));
      });
      if (buyerTx.committed === false) { window.notify?.("❌ Не удалось списать TON"); return; }

      // Добавляем продавцу
      await usersRef.child(sellerId).child("ton").transaction(v => {
        const cur = safeNumber(v);
        return Number((cur + sellerReceive).toFixed(9));
      });

      // Передаём яйца покупателю
      await usersRef.child(uid).child("eggs").transaction(v => {
        const cur = safeNumber(v);
        return cur + eggs;
      });

      // Удаляем лот
      await marketRef.child(lotId).remove();

      window.notify?.(`✅ Куплено ${eggs} яиц за ${formatTon(price)} TON (комиссия ${formatTon(fee)} TON)`);
      window.saveGame?.();
      window.updateUI?.();
    } catch (e) {
      console.warn("buyMarketLot error", e);
      window.notify?.("❌ Ошибка покупки лота");
    }
  }

  // Отменить лот (вернуть яйца продавцу)
  async function cancelMarketLot(lotId) {
    if (!marketRef || !usersRef) { window.notify?.("❌ DB не готова"); return; }
    const uid = window.userId;
    try {
      const lotSnap = await marketRef.child(lotId).once("value");
      if (!lotSnap.exists()) { window.notify?.("❌ Лот не найден"); return; }
      const lot = lotSnap.val();
      if (String(lot.userId) !== String(uid)) { window.notify?.("❌ Только владелец может отменить"); return; }

      const eggs = safeNumber(lot.eggs);

      // Удаляем лот и возвращаем яйца продавцу
      await marketRef.child(lotId).remove();
      await usersRef.child(uid).child("eggs").transaction(v => {
        const cur = safeNumber(v);
        return cur + eggs;
      });

      window.notify?.("✅ Лот отменён, яйца возвращены");
      window.saveGame?.();
      window.updateUI?.();
    } catch (e) {
      console.warn("cancelMarketLot error", e);
      window.notify?.("❌ Ошибка отмены лота");
    }
  }

  // Экспорт функций
  window.loadMarket = loadMarket;
  window.createMarketLot = createMarketLot;
  window.buyMarketLot = buyMarketLot;
  window.cancelMarketLot = cancelMarketLot;

  // Автозагрузка при старте
  if (marketRef) loadMarket();
})();