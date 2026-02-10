/* wallet.js — полный безопасный TON кошелёк с memo = tg id
   (тот же файл, но оставлен здесь для удобной вставки)
*/

(function () {
  // Конфигурация (замени при необходимости)
  const PROJECT_WALLET = "EQCTR1kelAPRbNRNTT7akth21ld2HK3kwtreiyXGTnybJ2Ma";
  const TONCENTER_API_KEY = "AEEXFSMRCCHTCJAAAAAKGJGS2LARKNSA4I3KBE4AYCIF24VL7LIU2TZNAZXD6AR5Z7DJYWY";
  const CHECK_INTERVAL_MS = 10000;

  // Firebase refs
  const withdrawRef = window.db ? window.db.ref("withdrawRequests") : null;
  const usersRef = window.db ? window.db.ref("users") : null;

  // userId (Telegram ID если есть)
  let userId = window.userId || ("guest_" + Math.random().toString(36).slice(2));
  window.userId = userId;

  // Вспомогательные функции и ссылки на UI функции
  const notify = window.notify || function (t) { console.log("NOTIFY:", t); };
  const saveGame = window.saveGame || function () { console.log("saveGame not defined"); };
  const updateUI = window.updateUI || function () { console.log("updateUI not defined"); };

  // Локальный TON баланс (синхронизируется с Firebase)
  let ton = Number(window.ton || 0);

  function safeNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  // Открыть кошелёк для пополнения (memo = Telegram ID)
  function openDeposit() {
    const raw = prompt("Сколько TON хочешь пополнить?");
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify("❌ Некорректная сумма");
      return;
    }

    const memo = encodeURIComponent(String(window.userId || ""));
    const nanotons = Math.round(amount * 1e9);
    const link = `ton://transfer/${PROJECT_WALLET}?amount=${nanotons}&text=${memo}`;

    notify("📨 Откроется TON кошелёк. После отправки подожди несколько секунд.");
    window.location.href = link;
  }

  // Парсер транзакций и авто-зачисление
  async function checkDeposits() {
    if (!PROJECT_WALLET || !TONCENTER_API_KEY) return;
    try {
      const url = `https://toncenter.com/api/v2/getTransactions?address=${PROJECT_WALLET}&limit=50&api_key=${TONCENTER_API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn("checkDeposits: bad response", res.status);
        return;
      }
      const data = await res.json();
      if (!data || !data.result) {
        console.warn("checkDeposits: no result", data);
        return;
      }

      for (const tx of data.result) {
        try {
          const inMsg = tx.in_msg || tx.in_message || tx.incoming_message || tx.incoming || null;
          if (!inMsg) continue;

          let memo = "";
          if (typeof inMsg.message === "string") memo = inMsg.message;
          else if (Array.isArray(inMsg.message)) memo = inMsg.message.map(p => (typeof p === "string" ? p : (p?.text || p?.payload || ""))).join("");
          else if (typeof inMsg.text === "string") memo = inMsg.text;
          else if (typeof inMsg.payload === "string") memo = inMsg.payload;
          if (!memo && tx.msg && typeof tx.msg === "object") memo = tx.msg.text || tx.msg.message || tx.msg.body || "";
          memo = String(memo || "").trim();
          try { const decoded = decodeURIComponent(memo); if (decoded && decoded !== memo) memo = decoded; } catch(e){}

          if (!memo) continue;
          if (String(memo) !== String(window.userId)) continue;

          const txHash = tx.transaction_id?.hash || tx.id || null;
          if (!txHash) continue;
          if (localStorage.getItem("tx_" + txHash)) continue;

          let amountNanotons = 0;
          if (inMsg.value) amountNanotons = safeNumber(inMsg.value, amountNanotons);
          if (!amountNanotons && tx.value) amountNanotons = safeNumber(tx.value, amountNanotons);
          if (!amountNanotons && tx.in_msg && tx.in_msg.value) amountNanotons = safeNumber(tx.in_msg.value, amountNanotons);
          if (!amountNanotons && tx.in_message && tx.in_message.value) amountNanotons = safeNumber(tx.in_message.value, amountNanotons);

          if (amountNanotons > 0 && amountNanotons < 1e6) amountNanotons = Math.round(amountNanotons * 1e9);
          if (!amountNanotons || amountNanotons <= 0) continue;

          const amountTON = amountNanotons / 1e9;
          if (!Number.isFinite(amountTON) || amountTON <= 0) continue;

          localStorage.setItem("tx_" + txHash, "1");

          ton = safeNumber(ton) + amountTON;
          window.ton = ton;

          if (usersRef) {
            usersRef.child(window.userId).child("ton").transaction(v => safeNumber(v) + amountTON);
          }

          saveGame();
          updateUI();
          notify(`💰 Пополнение: +${amountTON.toFixed(3)} TON (tx ${txHash.slice(0,8)})`);
        } catch (innerErr) {
          console.warn("checkDeposits inner error", innerErr);
          continue;
        }
      }
    } catch (err) {
      console.warn("checkDeposits error", err);
    }
  }

  // Запуск авто-проверки
  setInterval(checkDeposits, CHECK_INTERVAL_MS);
  setTimeout(checkDeposits, 2000);

  // Вывод TON (заявка с комиссией 5%)
  function openWithdraw() {
    const rawAmount = prompt("Сколько TON вывести?");
    if (!rawAmount) return;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify("❌ Некорректная сумма");
      return;
    }

    const fee = Number((amount * 0.05).toFixed(9));
    const total = Number((amount + fee).toFixed(9));

    ton = safeNumber(window.ton || ton);

    if (ton < total) {
      notify(`❌ Недостаточно TON. Нужно ${total.toFixed(3)} TON (включая комиссию).`);
      return;
    }

    const address = prompt("Введи TON адрес (например, EQ...)");
    if (!address || typeof address !== "string" || address.length < 10) {
      notify("❌ Неверный адрес");
      return;
    }

    ton = Number(ton) - total;
    window.ton = ton;

    if (usersRef) {
      usersRef.child(window.userId).child("ton").transaction(v => {
        const current = safeNumber(v);
        const newVal = current - total;
        return newVal >= 0 ? newVal : 0;
      });
    }

    if (withdrawRef) {
      withdrawRef.push({
        userId: window.userId,
        amount: Number(amount),
        fee: Number(fee),
        total: Number(total),
        address: String(address),
        time: Date.now(),
        status: "pending"
      });
    }

    saveGame();
    updateUI();

    notify(`📤 Заявка на вывод отправлена. Сумма: ${amount} TON, комиссия: ${fee.toFixed(3)} TON`);
  }

  // Экспорт функций
  window.openDeposit = openDeposit;
  window.openWithdraw = openWithdraw;
  window.checkDeposits = checkDeposits;

  // Синхронизация ton из Firebase при старте
  if (usersRef) {
    usersRef.child(window.userId).child("ton").on("value", snap => {
      const v = snap.exists() ? snap.val() : 0;
      ton = safeNumber(v);
      window.ton = ton;
      updateUI();
    });
  }
})();