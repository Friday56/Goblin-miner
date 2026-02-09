/* action.js — действия для аукционов и общие утилиты
   Функции:
   - loadAuctions() — отображает текущие аукционы
   - createAuction() — создаёт аукцион (eggs, startPrice, durationMinutes)
   - placeBid(auctionId, bidAmount) — ставит ставку
   - finalizeEndedAuctions() — автоматически завершает аукционы по таймеру
   - cancelAuction(auctionId) — отмена аукциона (только продавец, если нет ставок)
   Зависимости: window.db, window.userId, window.notify, window.saveGame, window.updateUI
*/

(function () {
  const auctionsRef = window.db ? window.db.ref("auctions") : null;
  const usersRef = window.db ? window.db.ref("users") : null;
  const FEE_RATE = 0.05; // комиссия платформы 5%
  const MIN_BID_INCREMENT = 0.1; // минимальный шаг ставки в TON

  function safeNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function formatTon(n) {
    return Number(n).toFixed(3);
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
      const div = document.createElement("div");
      div.className = "auction-item";
      div.style.border = "3px solid #000";
      div.style.padding = "8px";
      div.style.marginBottom = "8px";
      div.style.background = "#0b0b0b";

      const highest = item.highestBid || { amount: 0, bidder: null };
      const endsIn = Math.max(0, item.endTime - Date.now());
      const minutes = Math.floor(endsIn / 60000);
      const seconds = Math.floor((endsIn % 60000) / 1000);

      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:12px;"><b>${item.eggs}</b> яиц</div>
          <div style="font-size:12px;">Текущая: <b>${formatTon(highest.amount || item.startPrice)}</b> TON</div>
        </div>
        <div style="font-size:11px;margin-top:6px;color:#ccc;">
          Продавец: ${item.userId === window.userId ? "Вы" : item.userId}
          &nbsp;•&nbsp; Окончание: ${minutes}m ${seconds}s
        </div>
      `;

      const actions = document.createElement("div");
      actions.style.marginTop = "8px";
      actions.style.display = "flex";
      actions.style.gap = "8px";

      // Поле для ставки
      const bidInput = document.createElement("input");
      bidInput.type = "number";
      bidInput.placeholder = "Ставка TON";
      bidInput.style.padding = "6px";
      bidInput.style.border = "3px solid #000";
      bidInput.style.borderRadius = "6px";
      bidInput.style.background = "#0b0b0b";
      bidInput.style.color = "#fff";
      bidInput.style.width = "120px";

      const bidBtn = document.createElement("button");
      bidBtn.className = "pixel-btn small-btn";
      bidBtn.innerText = "Сделать ставку";
      bidBtn.onclick = () => {
        const val = Number(bidInput.value);
        placeBid(item.id, val);
      };

      actions.appendChild(bidInput);
      actions.appendChild(bidBtn);

      // Если владелец — кнопки отмены (если нет ставок)
      if (item.userId === window.userId) {
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "pixel-btn small-btn";
        cancelBtn.innerText = "Отменить";
        cancelBtn.onclick = () => cancelAuction(item.id);
        actions.appendChild(cancelBtn);
      }

      div.appendChild(actions);
      container.appendChild(div);
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
    const durationMinutes = 60; // по умолчанию 60 минут, можно сделать полем

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
      await usersRef.child(uid).child("eggs").transaction(v => {
        const cur = safeNumber(v);
        if (cur < eggs) return; // abort
        return cur - eggs;
      });

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

      // Блокируем сумму у нового победителя: списываем временно TON (сохраняем в поле lockedBids)
      // Для простоты: мы списываем сумму у нового победителя и возвращаем предыдущему (если был)
      // Списываем у нового победителя
      await usersRef.child(uid).child("ton").transaction(v => {
        const cur = safeNumber(v);
        if (cur < bidAmount) return; // abort
        return Number((cur - bidAmount).toFixed(9));
      });

      // Возвращаем предыдущему лидеру сумму (если была)
      if (auction.highestBid && auction.highestBid.bidder) {
        const prevBidder = String(auction.highestBid.bidder);
        const prevAmount = safeNumber(auction.highestBid.amount);
        await usersRef.child(prevBidder).child("ton").transaction(v => {
          const cur = safeNumber(v);
          return Number((cur + prevAmount).toFixed(9));
        });
      }

      // Обновляем запись аукциона
      await auctionsRef.child(auctionId).update({
        highestBid: {
          amount: Number(bidAmount),
          bidder: uid,
          time: Date.now()
        }
      });

      window.notify?.(`✅ Ставка ${formatTon(bidAmount)} TON принята`);
      window.saveGame?.();
      window.updateUI?.();
    } catch (e) {
      console.warn("placeBid error", e);
      window.notify?.("❌ Ошибка при ставке");
    }
  }

  // Отмена аукциона (только если нет ставок)
  async function cancelAuction(auctionId) {
    if (!auctionsRef || !usersRef) { window.notify?.("❌ DB не готова"); return; }
    const uid = window.userId;
    try {
      const snap = await auctionsRef.child(auctionId).once("value");
      if (!snap.exists()) { window.notify?.("❌ Аукцион не найден"); return; }
      const auction = snap.val();
      if (String(auction.userId) !== String(uid)) { window.notify?.("❌ Только владелец может отменить"); return; }
      if (auction.highestBid) { window.notify?.("❌ Нельзя отменить — уже есть ставки"); return; }

      // Удаляем аукцион и возвращаем яйца продавцу
      await auctionsRef.child(auctionId).remove();
      await usersRef.child(uid).child("eggs").transaction(v => {
        const cur = safeNumber(v);
        return cur + safeNumber(auction.eggs);
      });

      window.notify?.("✅ Аукцион отменён, яйца возвращены");
      window.saveGame?.();
      window.updateUI?.();
    } catch (e) {
      console.warn("cancelAuction error", e);
      window.notify?.("❌ Ошибка отмены аукциона");
    }
  }

  // Финализация завершённых аукционов: перевод денег продавцу (минус комиссия) и яиц победителю
  async function finalizeEndedAuctions() {
    if (!auctionsRef || !usersRef) return;
    try {
      const now = Date.now();
      const snap = await auctionsRef.orderByChild("endTime").endAt(now).once("value");
      if (!snap.exists()) return;
      const updates = [];
      snap.forEach(child => {
        const auction = child.val();
        const id = child.key;
        // Если нет ставок — вернуть яйца продавцу и удалить
        if (!auction.highestBid) {
          updates.push({ id, action: "return", auction });
        } else {
          updates.push({ id, action: "finalize", auction });
        }
      });

      for (const u of updates) {
        const id = u.id;
        const auction = u.auction;
        if (u.action === "return") {
          // вернуть яйца продавцу
          await usersRef.child(auction.userId).child("eggs").transaction(v => {
            const cur = safeNumber(v);
            return cur + safeNumber(auction.eggs);
          });
          await auctionsRef.child(id).remove();
          window.notify?.(`Аукцион ${id} завершён — без ставок, яйца возвращены продавцу`);
        } else if (u.action === "finalize") {
          const highest = auction.highestBid;
          const winner = String(highest.bidder);
          const amount = safeNumber(highest.amount);
          const seller = String(auction.userId);
          const fee = Number((amount * FEE_RATE).toFixed(9));
          const sellerReceive = Number((amount - fee).toFixed(9));

          // Переводим TON продавцу (уже списан у победителя при ставке)
          await usersRef.child(seller).child("ton").transaction(v => {
            const cur = safeNumber(v);
            return Number((cur + sellerReceive).toFixed(9));
          });

          // Передаём яйца победителю
          await usersRef.child(winner).child("eggs").transaction(v => {
            const cur = safeNumber(v);
            return cur + safeNumber(auction.eggs);
          });

          // Удаляем аукцион
          await auctionsRef.child(id).remove();

          window.notify?.(`🏁 Аукцион завершён: ${auction.eggs} яиц — победитель ${winner}, сумма ${formatTon(amount)} TON (комиссия ${formatTon(fee)} TON)`);
          window.saveGame?.();
          window.updateUI?.();
        }
      }
    } catch (e) {
      console.warn("finalizeEndedAuctions error", e);
    }
  }

  // Запуск периодической проверки завершённых аукционов
  setInterval(finalizeEndedAuctions, 15000);
  setTimeout(finalizeEndedAuctions, 5000);

  // Экспорт функций
  window.loadAuctions = loadAuctions;
  window.createAuction = createAuction;
  window.placeBid = placeBid;
  window.cancelAuction = cancelAuction;
  window.finalizeEndedAuctions = finalizeEndedAuctions;

  // Автозагрузка при старте
  if (auctionsRef) loadAuctions();
})();