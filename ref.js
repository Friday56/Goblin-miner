/* ref.js — реферальная логика */
(function(){
  const refRef = db.ref("referrals");
  const refCountRef = db.ref("refCount");
  const userId = window.userId || ("guest_" + Math.random().toString(36).slice(2));
  window.userId = userId;
  const refId = userId;
  window.refId = refId;

  function getRefLink(){
    const username = window.Telegram?.WebApp?.initDataUnsafe?.user?.username || "your_bot";
    return `https://t.me/${username}?start=${refId}`;
  }

  function copyRefLink(){
    const link = getRefLink();
    navigator.clipboard.writeText(link).then(()=> window.notify?.("🔗 Ссылка скопирована")).catch(()=> window.notify?.("❌ Не удалось скопировать"));
  }

  function registerReferral(){
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (!startParam) return;
    if (startParam === userId) return;
    refRef.child(startParam).child(userId).set({ joined: Date.now() });
    refCountRef.child(startParam).transaction(v => (v || 0) + 1);
    window.notify?.("🎉 Ты пришёл по реферальной ссылке!");
  }

  window.copyRefLink = copyRefLink;
  window.showMyReferrals = function(){
    const listWindow = document.createElement("div"); listWindow.className="modal-inner"; listWindow.style.position="fixed"; listWindow.style.left="12px"; listWindow.style.right="12px"; listWindow.style.top="50%"; listWindow.style.transform="translateY(-50%)"; listWindow.style.zIndex=10000;
    listWindow.innerHTML = `<h3>Мои рефералы</h3><div id="refList">Загрузка...</div><div style="text-align:center;margin-top:8px"><button class="pixel-btn" onclick="this.parentElement.parentElement.remove()">Закрыть</button></div>`;
    document.body.appendChild(listWindow);
    refRef.child(userId).once("value").then(snap=>{
      const box = document.getElementById("refList");
      if (!snap.exists()) { box.innerHTML = "Пока нет рефералов"; return; }
      let html = "";
      snap.forEach(item => { const refUser = item.key; const data = item.val(); html += `<div style="padding:6px;border-bottom:1px solid #222">ID: ${refUser} — ${new Date(data.joined).toLocaleString()}</div>`; });
      box.innerHTML = html;
    });
  };

  registerReferral();
})();